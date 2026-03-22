import { getSupabaseAdminClient } from "@/lib/supabase";

export type ConnectionProvider = "google" | "shopify";

export type ConnectedAccountRow = {
  user_id: string;
  provider: ConnectionProvider;
  account_identifier: string;
  access_token?: string | null;
  refresh_token?: string | null;
  token_expires_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

function getAdminClientSafe(): ReturnType<typeof getSupabaseAdminClient> | null {
  try {
    return getSupabaseAdminClient();
  } catch {
    return null;
  }
}

export async function upsertConnectedAccount(input: ConnectedAccountRow): Promise<boolean> {
  const client = getAdminClientSafe();
  if (!client) return false;

  const tableClient = client.from("connected_accounts" as never) as any;
  const { error } = await tableClient.upsert(
    {
      user_id: input.user_id,
      provider: input.provider,
      account_identifier: input.account_identifier,
      access_token: input.access_token ?? null,
      refresh_token: input.refresh_token ?? null,
      token_expires_at: input.token_expires_at ?? null,
      metadata: input.metadata ?? {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider,account_identifier" }
  );

  return !error;
}

export async function getConnectedAccount(
  userId: string,
  provider: ConnectionProvider,
  accountIdentifier?: string
): Promise<ConnectedAccountRow | null> {
  const client = getAdminClientSafe();
  if (!client) return null;

  let query = (client
    .from("connected_accounts" as never) as any)
    .select(
      "user_id,provider,account_identifier,access_token,refresh_token,token_expires_at,metadata"
    )
    .eq("user_id", userId)
    .eq("provider", provider);

  if (accountIdentifier) {
    query = query.eq("account_identifier", accountIdentifier);
  }

  const { data, error } = await query.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return error ? null : ((data as ConnectedAccountRow | null) ?? null);
}

export async function deleteConnectedAccount(
  userId: string,
  provider: ConnectionProvider,
  accountIdentifier?: string
): Promise<boolean> {
  const client = getAdminClientSafe();
  if (!client) return false;

  let query = (client.from("connected_accounts" as never) as any)
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);
  if (accountIdentifier) {
    query = query.eq("account_identifier", accountIdentifier);
  }
  const { error } = await query;
  return !error;
}
