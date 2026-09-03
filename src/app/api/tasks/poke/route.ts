import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bellNotify } from "@/lib/bellNotify";
import { pokeCooldownRemaining, formatCooldown } from "@/lib/pokeCooldown";
import { taskAppliesTo } from "@/lib/taskAssignment";

// Nudges a member about a task they still owe. Team Leader only, and only
// for a task that is genuinely outstanding for that person — poking someone
// who already submitted is noise, so the server checks rather than trusting
// the button's visibility.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const { data: caller } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (caller?.role !== "team_leader") {
    return NextResponse.json({ error: "Only the Team Leader can send a nudge." }, { status: 403 });
  }

  const { task_id, profile_ids } = await request.json();
  if (!task_id || !Array.isArray(profile_ids) || profile_ids.length === 0) {
    return NextResponse.json({ error: "task_id and profile_ids are required." }, { status: 400 });
  }

  const { data: task } = await admin
    .from("member_tasks")
    .select("id, assign_to, excluded_ids")
    .eq("id", task_id)
    .single();
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  // Drop anyone the task isn't for, and anyone already approved or awaiting
  // review — a nudge should only ever reach someone who actually owes work.
  const { data: completions } = await admin
    .from("member_task_completions")
    .select("profile_id, status")
    .eq("task_id", task_id)
    .in("profile_id", profile_ids);
  const settled = new Set(
    (completions ?? [])
      .filter((c: { status: string }) => c.status === "approved" || c.status === "pending")
      .map((c: { profile_id: string }) => c.profile_id),
  );

  const eligible = (profile_ids as string[]).filter(
    (id) => !settled.has(id) && taskAppliesTo(task, id),
  );
  if (eligible.length === 0) {
    return NextResponse.json({ error: "Nobody to nudge — they're all up to date." }, { status: 400 });
  }

  // Cooldown. Enforced here rather than only in the UI: the button is not
  // the only way to reach this route, and a nudge that arrives five times
  // running is one nobody reads.
  const { data: recent } = await admin
    .from("task_pokes")
    .select("profile_id, poked_at")
    .eq("task_id", task_id)
    .in("profile_id", eligible);

  const lastPoke = new Map(
    (recent ?? []).map((r: { profile_id: string; poked_at: string }) => [r.profile_id, r.poked_at]),
  );
  const targets = eligible.filter((id) => pokeCooldownRemaining(lastPoke.get(id)) === 0);

  if (targets.length === 0) {
    // Report the SHORTEST wait, not an arbitrary one — that is when this
    // button does something again.
    const soonest = Math.min(...eligible.map((id) => pokeCooldownRemaining(lastPoke.get(id))));
    return NextResponse.json(
      {
        error:
          eligible.length === 1
            ? `Already nudged. You can nudge them again in ${formatCooldown(soonest)}.`
            : `All of them were nudged recently. You can nudge again in ${formatCooldown(soonest)}.`,
      },
      { status: 429 },
    );
  }

  const pokedAt = new Date().toISOString();
  const { error: pokeError } = await admin.from("task_pokes").upsert(
    targets.map((id) => ({ task_id, profile_id: id, poked_by: user.id, poked_at: pokedAt })),
    { onConflict: "task_id,profile_id" },
  );
  // Recording the nudge is what enforces the next cooldown, so a failure
  // here must not send one anyway — that is how the limit gets bypassed.
  if (pokeError) {
    console.error("[tasks/poke] couldn't record the nudge:", pokeError);
    return NextResponse.json({ error: "Couldn't send that nudge. Please try again." }, { status: 500 });
  }

  await bellNotify(targets, user.id, "task_poke");
  return NextResponse.json({ ok: true, poked: targets.length, skipped: eligible.length - targets.length });
}
