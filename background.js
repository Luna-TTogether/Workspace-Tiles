import { callWorkspaceAi } from "./src/features/ai-client.js";
import { getAiConsent, setAiConsent } from "./src/features/ai-consent.js";

const MESSAGE_TYPES = new Set(["WORKSPACE_AI_CALL", "AI_CONSENT_GET", "AI_CONSENT_SET"]);

async function handleExtensionMessage(message, sender) {
  if (!message || !MESSAGE_TYPES.has(message.type)) return null;
  if (sender?.id && sender.id !== chrome.runtime.id) {
    const error = new Error("Unauthorized extension message");
    error.code = "AI_UNAUTHORIZED";
    throw error;
  }
  if (message.type === "AI_CONSENT_GET") return getAiConsent();
  if (message.type === "AI_CONSENT_SET") return setAiConsent(message.state);
  return callWorkspaceAi(message.task, message.input, {
    locale: message.locale,
    idempotencyKey: message.idempotencyKey,
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !MESSAGE_TYPES.has(message.type)) return false;
  handleExtensionMessage(message, sender)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({
      ok: false,
      error: {
        code: String(error?.code || "AI_PROVIDER_UNAVAILABLE"),
        message: String(error?.message || "AI request failed"),
        ...(error?.details ? { details: error.details } : {}),
      },
    }));
  return true;
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== "install") return;
  getAiConsent()
    .then((consent) => (consent.state === "unknown" ? setAiConsent("accepted") : consent))
    .catch(() => {});
});

export { handleExtensionMessage };
