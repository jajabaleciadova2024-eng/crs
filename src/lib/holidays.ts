import type { SupabaseClient } from "@supabase/supabase-js";

export type Holiday = { date: string; name: string };

// Fetch holidays overlapping [startDate, endDate] (inclusive, YYYY-MM-DD).
export async function holidaysInRange(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string,
): Promise<Holiday[]> {
  const { data } = await supabase
    .from("holidays")
    .select("date, name")
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date");
  return (data ?? []).map((r: any) => ({ date: r.date, name: r.name }));
}

// Fetch all holiday dates as a Set for quick lookup.
export async function holidayDateSet(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string,
): Promise<Set<string>> {
  const list = await holidaysInRange(supabase, startDate, endDate);
  return new Set(list.map((h) => h.date));
}
