import { requireProfile } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import TicketList from "@/components/tickets/TicketList";

export default async function ConcernsPage() {
  const profile = await requireProfile();

  return (
    <>
      <PageHeader
        title="Concerns"
        subtitle={
          profile.role === "team_leader"
            ? "Anonymous incident reports from team members"
            : "Submit anonymous concerns — your identity stays private"
        }
      />
      <TicketList userId={profile.id} currentUserRole={profile.role} />
    </>
  );
}
