alter table if exists public.scan_results
  add column if not exists scan_type text not null default 'free';

alter table if exists public.scan_results
  add column if not exists google_connected boolean not null default false;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'scan_results'
  ) then
    alter table public.scan_results
      drop constraint if exists scan_results_scan_type_check;

    alter table public.scan_results
      add constraint scan_results_scan_type_check
      check (scan_type in ('free', 'paid'));
  end if;
end $$;

