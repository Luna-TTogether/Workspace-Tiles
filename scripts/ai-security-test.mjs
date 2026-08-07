import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const manifest = JSON.parse(read("manifest.json"));
const clientSources = [
  "background.js",
  "src/config/ai-config.js",
  "src/features/ai-auth.js",
  "src/features/ai-client.js",
].map(read).join("\n");
const edge = read("supabase/functions/workspace-ai/index.ts");
const migration = read("supabase/migrations/202608070001_ai_usage.sql");
const config = read("supabase/config.toml");

assert.ok(manifest.permissions.includes("activeTab"));
assert.ok(manifest.permissions.includes("scripting"));
assert.ok(manifest.optional_permissions.includes("tabs"));
assert.equal(manifest.host_permissions.includes("<all_urls>"), false);
assert.deepEqual(
  manifest.host_permissions.filter((permission) => permission.includes("supabase.co")),
  ["https://yjgaesbstakiaciawceb.supabase.co/*"],
);
assert.doesNotMatch(clientSources, /DEEPSEEK_API_KEY|SUPABASE_SERVICE_ROLE_KEY|sb_secret_/);
assert.match(config, /verify_jwt\s*=\s*true/);
assert.match(migration, /alter table private\.ai_requests enable row level security/);
assert.match(migration, /revoke all on table private\.ai_requests from public, anon, authenticated/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(edge, /DEEPSEEK_API_KEY/);
assert.match(edge, /thinking:\s*\{ type: "disabled" \}/);
assert.match(edge, /response_format:\s*\{ type: "json_object" \}/);
assert.doesNotMatch(edge, /console\.(?:log|error).*payload|console\.(?:log|error).*authorization/i);

console.log("AI 安全测试通过：最小权限、客户端 Secret 隔离、JWT、RLS 与原子额度规则均符合预期。");
