-- Add is_super_admin flag to profiles.
-- Only a super admin can modify another super admin's profile, and
-- non-super-admin team leaders cannot delete or demote a super admin.
alter table public.profiles
  add column is_super_admin boolean not null default false;

-- Protect super-admin rows: only a super admin can update another
-- super admin's profile. Regular team leaders are blocked.
create or replace function public.guard_super_admin()
returns trigger
language plpgsql
security definer
as $$
declare
  caller_is_super boolean;
begin
  -- Only guard if the target row is a super admin
  if not old.is_super_admin then
    return new;
  end if;

  -- Allow if the caller IS the super admin (editing own row)
  if old.id = auth.uid() then
    -- But never let anyone remove their own super_admin flag
    if new.is_super_admin is distinct from old.is_super_admin then
      raise exception 'Cannot remove your own super-admin status.';
    end if;
    return new;
  end if;

  -- Service-role (no JWT / auth.uid() is null) bypasses — needed for
  -- admin-client operations triggered by the super admin's own API calls.
  if auth.uid() is null then
    return new;
  end if;

  -- Check if the caller is also a super admin
  select is_super_admin into caller_is_super
    from public.profiles
    where id = auth.uid();

  if not coalesce(caller_is_super, false) then
    raise exception 'Only a super admin can modify another super admin''s profile.';
  end if;

  return new;
end;
$$;

create trigger trg_guard_super_admin_update
  before update on public.profiles
  for each row
  execute function public.guard_super_admin();

-- Also guard deletes on super-admin rows
create or replace function public.guard_super_admin_delete()
returns trigger
language plpgsql
security definer
as $$
declare
  caller_is_super boolean;
begin
  if not old.is_super_admin then
    return old;
  end if;

  -- Service-role bypass
  if auth.uid() is null then
    return old;
  end if;

  select is_super_admin into caller_is_super
    from public.profiles
    where id = auth.uid();

  if not coalesce(caller_is_super, false) then
    raise exception 'Cannot remove a super admin.';
  end if;

  return old;
end;
$$;

create trigger trg_guard_super_admin_delete
  before delete on public.profiles
  for each row
  execute function public.guard_super_admin_delete();
