-- ============================================================================
-- Switch leave document storage from Google Drive to Supabase Storage.
-- - leave_requests.document_url -> document_path (a storage object path,
--   not a public URL — files are private, accessed via short-lived signed
--   URLs generated server-side, see src/lib/documentStorage.ts).
-- - New private "leave-documents" bucket. No storage.objects RLS policies
--   are added: everything goes through the service-role admin client
--   server-side (upload, signed URL generation, cleanup), which bypasses
--   RLS entirely — same as every other admin-client pattern in this app.
--   That means the bucket has zero direct client access, which is exactly
--   what we want for documents like medical certificates.
-- ============================================================================

alter table public.leave_requests
  rename column document_url to document_path;

insert into storage.buckets (id, name, public)
values ('leave-documents', 'leave-documents', false)
on conflict (id) do nothing;
