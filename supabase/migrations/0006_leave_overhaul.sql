-- ============================================================================
-- Leave requests overhaul:
--   - leave_type becomes free text (was a fixed enum) so Team Leaders can
--     define their own types in org_settings.
--   - org_settings.leave_types (text[]) replaced with leave_type_configs
--     (jsonb) — each type now carries a "behavior": standard review,
--     auto-approve-with-document (Sick/Bereavement), or vacation-style
--     conflict checking (Vacation).
--   - leave_request_ranges: lets one request cover non-consecutive dates
--     (the primary start_date/end_date stays as the first/primary range).
--   - document_url/document_uploaded_at: for the Sick/Bereavement proof
--     upload (uploaded to Google Drive, see src/lib/googleDrive.ts).
--   - flagged_conflict: set at submission time if a vacation-conflict-type
--     request overlapped another org-wide pending/approved one on any date.
--   - Associates/OIC can now edit or cancel their OWN request while it's
--     still pending (previously only Team Leader could touch it at all,
--     and only to approve/reject).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- leave_type: enum -> text, so custom TL-defined types can be used freely.
-- ---------------------------------------------------------------------------
alter table public.leave_requests
  alter column leave_type type text using leave_type::text;

-- ---------------------------------------------------------------------------
-- org_settings: leave_types (text[]) -> leave_type_configs (jsonb)
-- ---------------------------------------------------------------------------
alter table public.org_settings
  add column leave_type_configs jsonb not null default '[
    {"key":"vacation","label":"Vacation","behavior":"vacation_conflict"},
    {"key":"sick","label":"Sick","behavior":"auto_approve_document"},
    {"key":"bereavement","label":"Bereavement","behavior":"auto_approve_document"},
    {"key":"emergency","label":"Emergency","behavior":"review"},
    {"key":"other","label":"Other","behavior":"review"}
  ]'::jsonb;

alter table public.org_settings
  drop column leave_types;

-- ---------------------------------------------------------------------------
-- leave_requests: new columns
-- ---------------------------------------------------------------------------
alter table public.leave_requests
  add column document_url text,
  add column document_uploaded_at timestamptz,
  add column flagged_conflict boolean not null default false;

-- ---------------------------------------------------------------------------
-- leave_request_ranges — extra (non-consecutive) date ranges on a request,
-- beyond the primary start_date/end_date on the parent row.
-- ---------------------------------------------------------------------------
create table public.leave_request_ranges (
  id uuid primary key default gen_random_uuid(),
  leave_request_id uuid not null references public.leave_requests (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  constraint leave_request_ranges_dates_valid check (end_date >= start_date)
);

create index leave_request_ranges_request_idx on public.leave_request_ranges (leave_request_id);

alter table public.leave_request_ranges enable row level security;

create policy "leave_request_ranges_select_own_or_leadership"
  on public.leave_request_ranges for select
  using (
    exists (
      select 1 from public.leave_requests lr
      where lr.id = leave_request_id
        and (lr.associate_id = auth.uid() or public.is_leader_or_oic())
    )
  );

-- Owner can add/remove extra ranges only while their request is still
-- pending (same window edits are allowed in).
create policy "leave_request_ranges_write_own_pending"
  on public.leave_request_ranges for all
  using (
    exists (
      select 1 from public.leave_requests lr
      where lr.id = leave_request_id and lr.associate_id = auth.uid() and lr.status = 'pending'
    )
  )
  with check (
    exists (
      select 1 from public.leave_requests lr
      where lr.id = leave_request_id and lr.associate_id = auth.uid() and lr.status = 'pending'
    )
  );

-- ---------------------------------------------------------------------------
-- leave_requests: let the owner edit/cancel their own request while pending
-- ---------------------------------------------------------------------------
create policy "leave_requests_update_own_pending"
  on public.leave_requests for update
  using (associate_id = auth.uid() and status = 'pending')
  with check (associate_id = auth.uid() and status = 'pending');

create policy "leave_requests_delete_own_pending"
  on public.leave_requests for delete
  using (associate_id = auth.uid() and status = 'pending');
