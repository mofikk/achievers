(function () {
  let clientPromise = null;

  function safeParseJson(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  async function getConfig() {
    const response = await fetch('/api/auth/config', {
      headers: { 'Content-Type': 'application/json' }
    });

    const raw = await response.text();
    const payload = safeParseJson(raw);

    if (!response.ok) {
      throw new Error(payload?.error || `Unable to load Supabase config (HTTP ${response.status}).`);
    }

    if (!payload || !payload?.data?.url || !payload?.data?.anonKey) {
      const contentType = response.headers.get('content-type') || 'unknown';
      console.error('Invalid /api/auth/config payload', {
        contentType,
        preview: String(raw || '').slice(0, 160)
      });
      throw new Error('Server returned invalid auth config response.');
    }

    return payload.data;
  }

  async function createSupabaseBrowserClient() {
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('Supabase browser SDK failed to load.');
    }

    const config = await getConfig();
    return window.supabase.createClient(config.url, config.anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: true
      }
    });
  }

  window.getSupabaseClient = async function getSupabaseClient() {
    if (!clientPromise) {
      clientPromise = createSupabaseBrowserClient();
    }

    return clientPromise;
  };
})();
