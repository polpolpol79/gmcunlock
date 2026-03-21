create extension if not exists pgcrypto;

create table if not exists public.scan_results (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  profile jsonb not null,
  pagespeed jsonb not null,
  crawl jsonb not null,
  analysis jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists scan_results_created_at_idx
  on public.scan_results (created_at desc);

