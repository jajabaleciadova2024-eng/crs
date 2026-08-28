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
  avatar_url: string | null;
  role: AppRole;
  is_immune: boolean;
  is_active: boolean;
  tenure_group: TenureGroup;
  // Distinct from is_immune: rotation immunity pins your station, break
  // immunity pins your break slot.
  is_break_immune: boolean;
  created_at: string;
}

export interface Workstation {
  id: string;
  name: string;
  description: string | null;
  headcount: number;
  is_active: boolean;
  // Lower = manned first when short-staffed, protected hardest when handing
  // out breaks (1 Collecting Officer, 2 PACD, 3 Releasing Officer).
  man_priority: number | null;
  // Screeners can be borrowed to cover other stations.
  can_be_pulled: boolean;
  // Electronic Endorsement floats and relieves whoever is on break.
  is_reliever: boolean;
  // Fewest windows that must stay manned at any moment.
  min_manned: number;
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
  assignment_date: string;
  // The specific physical window this person sits at. Null for rows
  // generated before windows existed.
  window_id: string | null;
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
  is_half_day: boolean;
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

export interface Announcement {
  id: string;
  author_id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface AnnouncementSeen {
  id: string;
  announcement_id: string;
  profile_id: string;
  seen_at: string;
}

export type TicketStatus = "open" | "closed";

export interface Ticket {
  id: string;
  reporter_id: string;
  subject: string;
  description: string;
  status: TicketStatus;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketAttachment {
  id: string;
  ticket_id: string;
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
  created_at: string;
}

export interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface MemberTask {
  id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  assign_to: string;
  blocker_days_before: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type TaskCompletionStatus = "pending" | "approved" | "rejected";

export interface MemberTaskCompletion {
  id: string;
  task_id: string;
  profile_id: string;
  status: TaskCompletionStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  completed_at: string;
}

// A physically numbered service window belonging to a station (see
// 0027_workstation_windows.sql). `label` is text rather than an integer so an
// unnumbered window could still be recorded if one ever comes up.
export interface WorkstationWindow {
  id: string;
  workstation_id: string;
  label: string;
  is_active: boolean;
  created_at: string;
}

export type BreakSlotValue = "10:00" | "11:00" | "12:00";

// One row per (day, window) that goes on break. See 0028_break_time.sql.
export interface BreakAssignmentRow {
  id: string;
  schedule_week_id: string;
  assignment_date: string;
  window_id: string;
  associate_id: string;
  break_slot: BreakSlotValue;
  reliever_associate_id: string | null;
  created_at: string;
}

export type AssignmentAction = "assigned" | "moved" | "reassigned" | "removed";

// Append-only audit trail for station assignments (see
// 0026_assignment_history.sql). Written by a DB trigger, never by app code.
// Names are denormalized so the log stays readable after a workstation is
// renamed or a member is deactivated.
export interface AssignmentHistory {
  id: string;
  assignment_id: string | null;
  action: AssignmentAction;
  assignment_date: string;
  schedule_week_id: string | null;
  workstation_id: string | null;
  workstation_name: string | null;
  associate_id: string | null;
  associate_name: string | null;
  previous_workstation_id: string | null;
  previous_workstation_name: string | null;
  previous_associate_id: string | null;
  previous_associate_name: string | null;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_at: string;
}

export interface Holiday {
  date: string;
  name: string;
  created_by: string;
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
          avatar_url?: string | null;
          role?: AppRole;
          is_immune?: boolean;
          is_active?: boolean;
          tenure_group?: TenureGroup;
          is_break_immune?: boolean;
        };
        Update: {
          id?: string;
          psid?: string;
          first_name?: string;
          middle_name?: string | null;
          last_name?: string;
          email?: string;
          mobile_number?: string | null;
          avatar_url?: string | null;
          role?: AppRole;
          is_immune?: boolean;
          is_active?: boolean;
          tenure_group?: TenureGroup;
          is_break_immune?: boolean;
        };
        Relationships: [];
      };
      workstations: {
        Row: Workstation;
        Insert: {
          name: string; description?: string | null; headcount?: number; is_active?: boolean;
          man_priority?: number | null; can_be_pulled?: boolean; is_reliever?: boolean; min_manned?: number;
        };
        Update: {
          name?: string; description?: string | null; headcount?: number; is_active?: boolean;
          man_priority?: number | null; can_be_pulled?: boolean; is_reliever?: boolean; min_manned?: number;
        };
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
        Insert: { schedule_week_id: string; workstation_id: string; associate_id: string; assignment_date: string; window_id?: string | null };
        Update: { schedule_week_id?: string; workstation_id?: string; associate_id?: string; assignment_date?: string; window_id?: string | null };
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
          is_half_day?: boolean;
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
          is_half_day?: boolean;
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
      member_tasks: {
        Row: MemberTask;
        Insert: {
          title: string;
          description?: string | null;
          deadline?: string | null;
          assign_to?: string;
          blocker_days_before?: number;
          created_by: string;
        };
        Update: {
          title?: string;
          description?: string | null;
          deadline?: string | null;
          assign_to?: string;
          blocker_days_before?: number;
        };
        Relationships: [];
      };
      break_assignments: {
        Row: BreakAssignmentRow;
        Insert: {
          schedule_week_id: string;
          assignment_date: string;
          window_id: string;
          associate_id: string;
          break_slot: BreakSlotValue;
          reliever_associate_id?: string | null;
        };
        Update: { break_slot?: BreakSlotValue; reliever_associate_id?: string | null };
        Relationships: [];
      };
      workstation_windows: {
        Row: WorkstationWindow;
        Insert: { workstation_id: string; label: string; is_active?: boolean };
        Update: { workstation_id?: string; label?: string; is_active?: boolean };
        Relationships: [];
      };
      assignment_history: {
        Row: AssignmentHistory;
        // Insert/Update are intentionally `never`: the table is written only
        // by the assignments audit trigger. Application code reads it.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      member_task_completions: {
        Row: MemberTaskCompletion;
        Insert: {
          task_id: string;
          profile_id: string;
          status?: TaskCompletionStatus;
        };
        Update: {
          task_id?: string;
          status?: TaskCompletionStatus;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          profile_id?: string;
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
