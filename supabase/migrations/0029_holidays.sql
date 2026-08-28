-- TL-managed holidays — replaces the hardcoded phHolidays.ts calendar.
-- Each row is a single date the TL has declared as a holiday; generated
-- schedules on that date are treated as void (no assignments).

CREATE TABLE IF NOT EXISTS public.holidays (
  date       date        PRIMARY KEY,
  name       text        NOT NULL,
  created_by uuid        NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

-- Everyone can see holidays
CREATE POLICY "holidays_select_all" ON public.holidays
  FOR SELECT USING (true);

-- Only TL can insert/update/delete
CREATE POLICY "holidays_insert_tl" ON public.holidays
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'team_leader')
  );

CREATE POLICY "holidays_update_tl" ON public.holidays
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'team_leader')
  );

CREATE POLICY "holidays_delete_tl" ON public.holidays
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'team_leader')
  );
