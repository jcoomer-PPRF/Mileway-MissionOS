export type Fields = Record<string, string>;
export type User = { id: string; label: string; username: string };
export type Context = {
  participant_label: string;
  goal: string;
  source_text: string;
  known_source_gap: boolean;
  service_date: string;
  time_zone: string;
  service_type: string;
};
export type Encounter = {
  encounter_id: string;
  assignment_version: number;
  membership_version: number;
  author_id: string;
  reviewer_id: string;
  active: boolean;
  author_context: Context | null;
  notes: {
    note_id: string;
    state: string;
    revision: number;
    parent_id: string | null;
  }[];
};
export type Result = {
  note_id: string;
  state: string;
  row_version: number;
  content_version: number;
  revision: number;
  assignment_version: number;
  membership_version: number;
  server_time: string;
};
export type Note = Omit<Result, "server_time" | "revision"> & {
  encounter_id: string;
  original_author_id: string;
  parent_id: string | null;
  correction_reason: string | null;
  access: {
    observer: boolean;
    can_review: boolean;
    can_correct: boolean;
    can_export: boolean;
  };
  draft: { fields: Fields; context: Context; checked: boolean } | null;
  revisions: {
    number: number;
    snapshot: { fields: Fields; context: Context; watermark: string };
    submitted_by: string;
    submitted_at: string;
  }[];
  reviews: { revision: number; action: string; reason: string | null }[];
};
export type Command = {
  encounter_id: string;
  note_id: string | null;
  request_id: string;
  row_version: number;
  assignment_version: number;
  membership_version: number;
  command: string;
  payload: Record<string, unknown>;
};
export class ApiError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
let csrf = "";
let authGeneration = 0;
export async function request<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/md02/" + path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers:
        body === undefined
          ? {}
          : { "Content-Type": "application/json", "X-MD02-CSRF": csrf },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("TRANSIENT_FAILURE");
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError("TRANSIENT_FAILURE");
  }
  if (!response.ok) throw new ApiError(data.code || "TRANSIENT_FAILURE");
  return data;
}
export async function session() {
  const g = authGeneration;
  const s = await request<{ user: User | null; csrf?: string }>("session");
  if (g === authGeneration) csrf = s.csrf || "";
  return s.user;
}
export async function login(username: string, password: string) {
  const g = ++authGeneration;
  const s = await request<{ user: User; csrf: string }>("login", {
    username,
    password,
  });
  if (g === authGeneration) csrf = s.csrf;
  return s.user;
}
export async function logout() {
  const g = ++authGeneration;
  await request("logout", {});
  if (g === authGeneration) csrf = "";
}
export const list = () => request<Encounter[]>("encounters", {});
export const read = (id: string) => request<Note>("note", { note_id: id });
export const command = (job: Command) => request<Result>("command", job);
export const revoked = (e: unknown) =>
  e instanceof ApiError &&
  ["AUTH_REQUIRED", "NOT_FOUND_OR_NOT_ALLOWED"].includes(e.code);

export type Output = {
  note_id: string;
  encounter_id: string;
  revision: number;
  submitted_at: string;
  submitted_by: string;
  original_author_id: string;
  parent_id: string | null;
  correction_reason: string | null;
  snapshot: { fields: Fields; context: Context; watermark: string };
  review: {
    action: string;
    reason: string | null;
    actor_id: string;
    reviewed_at: string;
  } | null;
};
export const output = (
  id: string,
  revision: number,
  mode: "preview" | "export",
) => request<Output>("output", { note_id: id, revision, mode });
