import type { Episode, RequestDetail, RequestRow, User } from "@/api/types";

export const client: User = {
  id: 4,
  email: "client-a@oreste.dev",
  name: "Acme Robotics",
  organisation: "Acme Robotics",
  role: "client",
  is_active: true,
};
export const operator: User = {
  id: 2,
  email: "ops1@oreste.dev",
  name: "Olu Operator",
  organisation: null,
  role: "operator",
  is_active: true,
};
export const admin: User = {
  id: 1,
  email: "admin@oreste.dev",
  name: "Ada Admin",
  organisation: null,
  role: "admin",
  is_active: true,
};

export const row = (over: Partial<RequestRow> = {}): RequestRow => ({
  id: 1,
  client_id: 4,
  client_name: "Acme Robotics",
  client_organisation: "Acme Robotics",
  task_name: "pick cup",
  episodes_requested: 3,
  deadline: "2099-01-01",
  notes: "",
  status: "submitted",
  assigned_count: 0,
  created_at: "2026-10-03T10:00:00Z",
  updated_at: "2026-10-03T10:00:00Z",
  ...over,
});

export const episode = (id: string, over: Partial<Episode> = {}): Episode => ({
  episode_id: id,
  robot_id: "arm-01",
  task_name: "pick cup",
  recorded_at: "2026-08-30T10:25:00Z",
  duration_seconds: 60,
  operator_name: "Aline",
  quality: "good",
  assigned_request_id: null,
  export: null,
  ...over,
});

export const detail = (over: Partial<RequestDetail> = {}): RequestDetail => ({
  ...row(),
  events: [
    {
      from_status: null,
      to_status: "submitted",
      actor_id: 4,
      actor_name: "Acme Robotics",
      created_at: "2026-10-03T10:00:00Z",
    },
  ],
  episodes: [],
  allowed_transitions: [],
  ...over,
});
