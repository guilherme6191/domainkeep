import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let userClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

/**
 * Read client. Queries carry the caller's Clerk token, and the database limits
 * that role to selecting its own rows. Lazy so builds and tests need no config.
 */
export function db(): SupabaseClient {
  if (userClient) return userClient;

  userClient = createClient(
    required("SUPABASE_URL"),
    required("SUPABASE_PUBLISHABLE_KEY"),
    {
      // Null when signed out; routes check the session before querying.
      accessToken: async () => (await auth()).getToken(),
    },
  );
  return userClient;
}

/**
 * Write client. Holds the secret key, so only the server can write. Its role
 * bypasses row-level security, so every write in `claims.ts` filters by owner.
 */
export function dbAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  adminClient = createClient(
    required("SUPABASE_URL"),
    required("SUPABASE_SECRET_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return adminClient;
}
