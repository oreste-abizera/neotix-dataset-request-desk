import type { Role, Status } from "@/api/types";

export const APP_NAME = "Dataset Request Desk";

export const STATUS_ORDER: Status[] = [
  "submitted",
  "in_progress",
  "delivered",
  "accepted",
  "rejected",
];

export const STATUS_LABEL: Record<Status, string> = {
  submitted: "Submitted",
  in_progress: "In progress",
  delivered: "Delivered",
  accepted: "Accepted",
  rejected: "Rejected",
};

/** What a status means, in the words a client (not an operator) needs. */
export const STATUS_HINT: Record<Status, { client: string; staff: string }> = {
  submitted: {
    client: "We have your request and an operator will pick it up soon.",
    staff: "Waiting for an operator to start work.",
  },
  in_progress: {
    client: "An operator is collecting and assigning episodes for you.",
    staff: "Assign episodes, then mark it delivered.",
  },
  delivered: {
    client: "Your dataset is ready. Review the episodes and accept or reject it.",
    staff: "Waiting for the client to accept or reject.",
  },
  accepted: { client: "You accepted this delivery. Nothing more to do.", staff: "Completed." },
  rejected: {
    client: "You rejected this delivery. The team will rework it.",
    staff: "Rejected by the client. Start rework to continue.",
  },
};

export interface TransitionCopy {
  action: string;
  title: string;
  description: string;
  confirm: string;
  tone: "primary" | "danger";
  /** Needs an explicit confirmation step. */
  confirmFirst: boolean;
}

export const TRANSITION_COPY: Record<Status, TransitionCopy> = {
  submitted: {
    action: "Submit",
    title: "Submit request?",
    description: "",
    confirm: "Submit",
    tone: "primary",
    confirmFirst: false,
  },
  in_progress: {
    action: "Start work",
    title: "Start work on this request?",
    description: "The request moves to “In progress” and the client can see it.",
    confirm: "Start work",
    tone: "primary",
    confirmFirst: false,
  },
  delivered: {
    action: "Mark delivered",
    title: "Mark this request as delivered?",
    description:
      "The client will be asked to review it, and the assigned episodes can no longer be changed.",
    confirm: "Mark delivered",
    tone: "primary",
    confirmFirst: true,
  },
  accepted: {
    action: "Accept delivery",
    title: "Accept this delivery?",
    description: "This closes the request. It cannot be undone.",
    confirm: "Accept delivery",
    tone: "primary",
    confirmFirst: true,
  },
  rejected: {
    action: "Reject delivery",
    title: "Reject this delivery?",
    description: "The request goes back to the team for rework.",
    confirm: "Reject delivery",
    tone: "danger",
    confirmFirst: true,
  },
};

export const ROLE_LABEL: Record<Role, string> = {
  client: "Client",
  operator: "Operator",
  admin: "Admin",
};

export const QUALITY_LABEL = { good: "Good", usable: "Usable", bad: "Bad" } as const;

export const IMPORT_REASON_LABEL: Record<string, string> = {
  duplicate_in_file: "Duplicate in file",
  conflicting_duplicate_in_file: "Conflicting duplicate in file",
  conflict_with_existing: "Conflicts with existing episode",
  missing_episode_id: "Missing episode id",
  invalid_episode_id: "Invalid episode id",
  missing_robot_id: "Missing robot",
  unknown_robot: "Unknown robot",
  missing_task_name: "Missing task",
  invalid_task_name: "Invalid task",
  missing_recorded_at: "Missing recorded time",
  invalid_recorded_at: "Invalid recorded time",
  recorded_at_in_future: "Recorded in the future",
  missing_duration: "Missing duration",
  invalid_duration: "Invalid duration",
  missing_quality: "Missing quality",
  invalid_quality: "Invalid quality",
  malformed_row: "Malformed row",
};
