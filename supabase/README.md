# Workspace Tiles Supabase setup

The extension contains only the project URL and publishable key. Never add the database password, service-role key, or DeepSeek key to extension files.

## Dashboard setup

1. Enable Anonymous Sign-Ins in Authentication settings.
2. Keep automatic RLS enabled and automatic table exposure disabled.
3. Set these Edge Function secrets in the Supabase Dashboard or CLI:

    DEEPSEEK_API_KEY=...
    DEEPSEEK_BASE_URL=https://api.deepseek.com
    DEEPSEEK_MODEL=deepseek-v4-flash
    ALLOWED_EXTENSION_ORIGIN=chrome-extension://oemdniafcebhmmmihlejdkpkeicnklki

Before deployment, confirm the exact DeepSeek model identifier and JSON response support against the provider's current API.

## Deploy

    supabase link --project-ref yjgaesbstakiaciawceb
    supabase db push
    supabase functions deploy workspace-ai

Do not disable JWT verification for workspace-ai.
