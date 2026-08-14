// Pure display — dashboard header photo. Upload/remove now lives in
// Settings ("My account" > Profile photo), not here, so it can't be
// accidentally clicked/changed from the dashboard greeting.
export default function ProfilePhotoFrame({
  firstName,
  lastName,
  avatarUrl,
}: {
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
}) {
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();

  return (
    <div
      className="w-[84px] h-[84px] rounded-full overflow-hidden border-[3px] border-[var(--paper-raised)] shrink-0"
      style={{ boxShadow: "0 0 0 2px var(--accent), var(--shadow-md)" }}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={`${firstName}'s photo`} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-[var(--accent-soft)] to-[var(--accent-soft)]/60 text-[var(--accent-strong)] flex items-center justify-center text-[28px] font-bold font-serif">
          {initials}
        </div>
      )}
    </div>
  );
}
