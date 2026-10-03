export type Role = "client" | "operator" | "admin";
export type Status = "submitted" | "in_progress" | "delivered" | "accepted" | "rejected";

export interface User {
  id: number;
  email: string;
  name: string;
  organisation: string | null;
  role: Role;
  is_active: boolean;
}

export interface RequestRow {
  id: number;
  client_id: number;
  client_name: string;
  client_organisation: string | null;
  task_name: string;
  episodes_requested: number;
  deadline: string;
  notes: string;
  status: Status;
  assigned_count: number;
  created_at: string;
  updated_at: string;
}

export interface ExportInfo {
  status: "pending" | "running" | "succeeded" | "failed";
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  next_attempt_at: string | null;
  finished_at: string | null;
}

export interface Episode {
  episode_id: string;
  robot_id: string;
  task_name: string;
  recorded_at: string;
  duration_seconds: number;
  operator_name: string | null;
  quality: "good" | "usable" | "bad";
  assigned_request_id: number | null;
  export?: ExportInfo | null; // staff only
}

export interface StatusEvent {
  from_status: Status | null;
  to_status: Status;
  actor_id: number;
  actor_name: string;
  created_at: string;
}

export interface RequestDetail extends RequestRow {
  events: StatusEvent[];
  episodes: Episode[];
  allowed_transitions: Status[];
}

export interface EpisodePage {
  items: Episode[];
  total: number;
  page: number;
  page_size: number;
}

export interface ImportReport {
  import_run_id: number;
  filename: string;
  total_rows: number;
  blank_lines: number;
  imported: number;
  unchanged: number;
  skipped_count: number;
  skipped_by_reason: Record<string, number>;
  warnings_by_code: Record<string, number>;
  skipped: { line: number; episode_id: string | null; reason: string; detail: string }[];
  details_truncated: boolean;
}

export interface Analytics {
  from: string;
  to: string;
  episodes_per_day_per_robot: { day: string; robot_id: string; episodes: number }[];
  requests: {
    by_status: Record<Status, number>;
    total: number;
    delivered_count: number;
    median_seconds_submitted_to_delivered: number | null;
  };
  top_tasks_by_good_episodes: { task_name: string; good_episodes: number }[];
}

export interface ImportRunSummary {
  id: number;
  filename: string;
  created_at: string;
  user_id: number | null;
  imported: number | null;
  unchanged: number | null;
  skipped_count: number | null;
}
