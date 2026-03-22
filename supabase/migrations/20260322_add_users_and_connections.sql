create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  provider text not null check (provider in ('google', 'shopify')),
  account_identifier text not null,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists connected_accounts_user_provider_identifier_idx
  on public.connected_accounts (user_id, provider, account_identifier);

create index if not exists connected_accounts_user_provider_idx
  on public.connected_accounts (user_id, provider);

alter table if exists public.scan_results
  add column if not exists user_id uuid references public.app_users(id) on delete set null;

create index if not exists scan_results_user_id_created_at_idx
  on public.scan_results (user_id, created_at desc);
