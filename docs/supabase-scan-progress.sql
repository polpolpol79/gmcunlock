-- Optional columns for async scans + progress UI (scan_results or scans — apply to the table you use).
-- Run in Supabase SQL editor after backup.

alter table scan_results
  add column if not exists scan_status text default 'done',
  add column if not exists scan_phase text,
  add column if not exists scan_phase_detail text,
  add column if not exists scan_error text,
  add column if not exists progress_updated_at timestamptz;

-- If your project uses the legacy `scans` table instead, repeat:
-- alter table scans
--   add column if not exists scan_status text default 'done',
--   ...

comment on column scan_results.scan_status is 'queued | running | done | error';
comment on column scan_results.scan_phase is 'Machine-readable phase key (e.g. pagespeed_crawl)';
comment on column scan_results.scan_phase_detail is 'User-facing short status line';
