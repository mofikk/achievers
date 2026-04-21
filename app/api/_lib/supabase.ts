import { createClient } from "@supabase/supabase-js";

export function createSupabaseServerClient(token?: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: token
          ? { Authorization: `Bearer ${token}` }
          : {}
      }
    }
  );

  return supabase;
}
