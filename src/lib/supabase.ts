import { createClient } from "@supabase/supabase-js";

type SupabaseClient = ReturnType<typeof createClient>;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

let anonClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

/**
 * Public (anon) Supabase client for server-side usage in route handlers.
 * Initialized lazily so the project can still build with empty placeholder env vars.
 */
export function getSupabaseClient(): SupabaseClient {
  if (anonClient) return anonClient;

  const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  anonClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  return anonClient;
}

/**
 * Service role Supabase client (admin) for privileged operations.
 * Initialized lazily so the project can still build with empty placeholder env vars.
 */
export function getSupabaseAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;

  const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return adminClient;
}

