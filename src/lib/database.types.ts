// Hand-authored types mirroring supabase/migrations/0001_init.sql.
// If the schema changes, update this alongside the migration
// (or later regenerate via `supabase gen types typescript`).
//
// NOTE: Insert/Update types are spelled out explicitly (not derived via
// Partial<Row> & Pick<...> intersections) — the intersection form triggers a
// known TS resolution issue against @supabase/ssr's generic defaults that
// silently collapses query results to `never`.

import type { LeaveTypeConfig } from "./leaveTypes";

export type AppRole = "team_leader" | "oic" | "associate";
// leave_type is free text now (was a fixed enum) — driven by
// org_settings.leave_type_configs, see src/lib/leaveTypes.ts.
export type LeaveType = string;
export type LeaveStatus = "pending" | "approved" | "rejected";
export type ScheduleCadence = "weekly" | "biweekly";
export type TenureGroup = "new_hire" | "tenured";
export type AccessRequestStatus = "pending" | "approved" | "rejected";

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
  tenure_group: TenureGroup;
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
  document_path: string | null;
  document_uploaded_at: string | null;
  flagged_conflict: boolean;
  seen_by_associate: boolean;
  review_note: string | null;
  final_rejection: boolean;
  created_at: string;
}

export interface LeaveRequestRange {
  id: string;
  leave_request_id: string;
  start_date: string;
  end_date: string;
  created_at: string;
}

export interface OrgSettings {
  id: string;
  schedule_cadence: ScheduleCadence;
  leave_type_configs: LeaveTypeConfig[];
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

export interface AccessRequest {
  id: string;
  psid: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string;
  mobile_number: string | null;
  message: string | null;
  status: AccessRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
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
          tenure_group?: TenureGroup;
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
          tenure_group?: TenureGroup;
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
          document_path?: string | null;
          document_uploaded_at?: string | null;
          flagged_conflict?: boolean;
          seen_by_associate?: boolean;
          review_note?: string | null;
          final_rejection?: boolean;
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
          document_path?: string | null;
          document_uploaded_at?: string | null;
          flagged_conflict?: boolean;
          seen_by_associate?: boolean;
          review_note?: string | null;
          final_rejection?: boolean;
        };
        Relationships: [];
      };
      leave_request_ranges: {
        Row: LeaveRequestRange;
        Insert: { leave_request_id: string; start_date: string; end_date: string };
        Update: { leave_request_id?: string; start_date?: string; end_date?: string };
        Relationships: [];
      };
      org_settings: {
        Row: OrgSettings;
        Insert: {
          schedule_cadence?: ScheduleCadence;
          leave_type_configs?: LeaveTypeConfig[];
          require_leave_reason?: boolean;
          approver_roles?: AppRole[];
        };
        Update: {
          schedule_cadence?: ScheduleCadence;
          leave_type_configs?: LeaveTypeConfig[];
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
      access_requests: {
        Row: AccessRequest;
        Insert: {
          psid?: string | null;
          first_name: string;
          middle_name?: string | null;
          last_name: string;
          email: string;
          mobile_number?: string | null;
          message?: string | null;
          status?: AccessRequestStatus;
        };
        Update: {
          psid?: string | null;
          first_name?: string;
          middle_name?: string | null;
          last_name?: string;
          email?: string;
          mobile_number?: string | null;
          message?: string | null;
          status?: AccessRequestStatus;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
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
      leave_status: LeaveStatus;
      schedule_cadence: ScheduleCadence;
      tenure_group: TenureGroup;
      access_request_status: AccessRequestStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
