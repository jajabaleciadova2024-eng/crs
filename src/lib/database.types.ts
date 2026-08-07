// Hand-authored types mirroring supabase/migrations/0001_init.sql.
// If the schema changes, update this alongside the migration
// (or later regenerate via `supabase gen types typescript`).
//
// NOTE: Insert/Update types are spelled out explicitly (not derived via
// Partial<Row> & Pick<...> intersections) — the intersection form triggers a
// known TS resolution issue against @supabase/ssr's generic defaults that
// silently collapses query results to `never`.

export type AppRole = "team_leader" | "oic" | "associate";
export type LeaveType = "sick" | "vacation" | "emergency" | "other";
export type LeaveStatus = "pending" | "approved" | "rejected";
export type ScheduleCadence = "weekly" | "biweekly";

export interface Profile {
  id: string;
  psid: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string;
  mobile_number: string | null;
  role: AppRole;
  is_immune: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Workstation {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ScheduleWeek {
  id: string;
  week_start_date: string;
  generated_by: string | null;
  created_at: string;
}

export interface Assignment {
  id: string;
  schedule_week_id: string;
  workstation_id: string;
  associate_id: string;
  created_at: string;
}

export interface LeaveRequest {
  id: string;
  associate_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: LeaveStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface OrgSettings {
  id: string;
  schedule_cadence: ScheduleCadence;
  leave_types: string[];
  require_leave_reason: boolean;
  approver_roles: AppRole[];
  updated_at: string;
}

export interface NotificationPrefs {
  id: string;
  profile_id: string;
  on_own_leave_status_change: boolean;
  on_schedule_published: boolean;
  on_new_leave_to_review: boolean;
  remind_pending_after_hours: number | null;
  updated_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          psid: string;
          first_name: string;
          middle_name?: string | null;
          last_name: string;
          email: string;
          mobile_number?: string | null;
          role?: AppRole;
          is_immune?: boolean;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          psid?: string;
          first_name?: string;
          middle_name?: string | null;
          last_name?: string;
          email?: string;
          mobile_number?: string | null;
          role?: AppRole;
          is_immune?: boolean;
          is_active?: boolean;
        };
        Relationships: [];
      };
      workstations: {
        Row: Workstation;
        Insert: { name: string; description?: string | null; is_active?: boolean };
        Update: { name?: string; description?: string | null; is_active?: boolean };
        Relationships: [];
      };
      schedule_weeks: {
        Row: ScheduleWeek;
        Insert: { week_start_date: string; generated_by?: string | null };
        Update: { week_start_date?: string; generated_by?: string | null };
        Relationships: [];
      };
      assignments: {
        Row: Assignment;
        Insert: { schedule_week_id: string; workstation_id: string; associate_id: string };
        Update: { schedule_week_id?: string; workstation_id?: string; associate_id?: string };
        Relationships: [];
      };
      leave_requests: {
        Row: LeaveRequest;
        Insert: {
          associate_id: string;
          leave_type: LeaveType;
          start_date: string;
          end_date: string;
          reason?: string | null;
          status?: LeaveStatus;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
        };
        Update: {
          associate_id?: string;
          leave_type?: LeaveType;
          start_date?: string;
          end_date?: string;
          reason?: string | null;
          status?: LeaveStatus;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
        };
        Relationships: [];
      };
      org_settings: {
        Row: OrgSettings;
        Insert: {
          schedule_cadence?: ScheduleCadence;
          leave_types?: string[];
          require_leave_reason?: boolean;
          approver_roles?: AppRole[];
        };
        Update: {
          schedule_cadence?: ScheduleCadence;
          leave_types?: string[];
          require_leave_reason?: boolean;
          approver_roles?: AppRole[];
        };
        Relationships: [];
      };
      notification_prefs: {
        Row: NotificationPrefs;
        Insert: {
          profile_id: string;
          on_own_leave_status_change?: boolean;
          on_schedule_published?: boolean;
          on_new_leave_to_review?: boolean;
          remind_pending_after_hours?: number | null;
        };
        Update: {
          profile_id?: string;
          on_own_leave_status_change?: boolean;
          on_schedule_published?: boolean;
          on_new_leave_to_review?: boolean;
          remind_pending_after_hours?: number | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      email_for_psid: {
        Args: { lookup_psid: string };
        Returns: string;
      };
    };
    Enums: {
      app_role: AppRole;
      leave_type: LeaveType;
      leave_status: LeaveStatus;
      schedule_cadence: ScheduleCadence;
    };
    CompositeTypes: Record<string, never>;
  };
}
