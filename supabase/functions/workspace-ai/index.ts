import {
  TASK_LIMITS,
  buildProviderMessages,
  validateProviderResult,
  validateRequestEnvelope,
} from "../_shared/ai-schema.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_PUBLIC_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY") || "";
const DEEPSEEK_BASE_URL = (Deno.env.get("DEEPSEEK_BASE_URL") || "https://api.deepseek.com").replace(/\/$/, "");
const DEEPSEEK_MODEL = Deno.env.get("DEEPSEEK_MODEL") || "deepseek-v4-flash";
const ALLOWED_EXTENSION_ORIGIN = Deno.env.get("ALLOWED_EXTENSION_ORIGIN") || "";
const MAX_BODY_BYTES = 64 * 1024;

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_EXTENSION_ORIGIN && origin === ALLOWED_EXTENSION_ORIGIN ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(request: Request, body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(request), ...headers },
  });
}

function errorResponse(request: Request, code: string, status: number, usage?: unknown) {
  return json(request, {
    error: { code, message: code },
    ...(usage ? { usage } : {}),
  }, status);
}

async function authenticate(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const response = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: SUPABASE_PUBLIC_KEY, Authorization: authorization },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user?.id === "string" ? user : null;
}

async function rpc(name: string, body: Record<string, unknown>) {
  const response = await fetch(SUPABASE_URL + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("RPC failed");
  return response.json();
}

async function callDeepSeek(task: string, input: Record<string, unknown>, locale: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(DEEPSEEK_BASE_URL + "/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + DEEPSEEK_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: buildProviderMessages(task, input, locale),
        thinking: { type: "disabled" },
        temperature: 0.1,
        max_tokens: 800,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Provider unavailable");
    const body = await response.json();
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Provider response content missing");
    return JSON.parse(content);
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "POST") return errorResponse(request, "AI_INVALID_REQUEST", 405);
  if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return errorResponse(request, "AI_PROVIDER_UNAVAILABLE", 503);
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) return errorResponse(request, "AI_PAYLOAD_TOO_LARGE", 413);

  const user = await authenticate(request);
  if (!user) return errorResponse(request, "AI_UNAUTHORIZED", 401);
  if (!DEEPSEEK_API_KEY) return errorResponse(request, "AI_PROVIDER_UNAVAILABLE", 503);

  let payload: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
      return errorResponse(request, "AI_PAYLOAD_TOO_LARGE", 413);
    }
    payload = JSON.parse(raw);
  } catch {
    return errorResponse(request, "AI_INVALID_REQUEST", 400);
  }
  if (!validateRequestEnvelope(payload)) return errorResponse(request, "AI_INVALID_REQUEST", 400);

  const task = String(payload.task);
  let claim;
  try {
    claim = await rpc("claim_ai_request", {
      p_user_id: user.id,
      p_task: task,
      p_idempotency_key: payload.idempotencyKey,
      p_daily_limit: TASK_LIMITS[task],
    });
  } catch {
    return errorResponse(request, "AI_STORAGE_ERROR", 503);
  }
  const usage = { remaining: claim.remaining, limit: claim.limit, resetAt: claim.resetAt };
  if (claim.claim === "quota_exceeded") return errorResponse(request, "AI_QUOTA_EXCEEDED", 429, usage);
  if (claim.claim === "processing") return errorResponse(request, "AI_PROVIDER_UNAVAILABLE", 409, usage);
  if (claim.claim === "cached") {
    return json(request, { requestId: claim.requestId, data: claim.result, usage });
  }

  try {
    const result = await callDeepSeek(task, payload.input as Record<string, unknown>, String(payload.locale || "en"));
    if (!validateProviderResult(task, result, payload.input as Record<string, unknown>)) {
      await rpc("fail_ai_request", {
        p_user_id: user.id,
        p_request_id: claim.requestId,
        p_error_code: "AI_INVALID_RESPONSE",
      });
      return errorResponse(request, "AI_INVALID_RESPONSE", 502, usage);
    }
    await rpc("complete_ai_request", {
      p_user_id: user.id,
      p_request_id: claim.requestId,
      p_result: result,
    });
    return json(request, { requestId: claim.requestId, data: result, usage });
  } catch (providerError) {
    const code = providerError?.name === "AbortError" ? "AI_PROVIDER_TIMEOUT" : "AI_PROVIDER_UNAVAILABLE";
    try {
      await rpc("fail_ai_request", {
        p_user_id: user.id,
        p_request_id: claim.requestId,
        p_error_code: code,
      });
    } catch {
      // No request data or provider error text is logged.
    }
    return errorResponse(request, code, code === "AI_PROVIDER_TIMEOUT" ? 504 : 502, usage);
  }
});
