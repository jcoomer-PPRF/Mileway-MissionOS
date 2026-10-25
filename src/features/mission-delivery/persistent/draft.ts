import {
  ApiError,
  type Fields,
  type Note,
  type Command,
  type Result,
  type Encounter,
} from "./api";
export type SaveStatus = "saved" | "unsaved" | "saving" | "failed" | "conflict";
/** One writer per note. Failed/uncertain requests retain their exact ID/payload. */
export class DraftSession {
  fields: Fields;
  status: SaveStatus = "saved";
  seq = 0;
  ack = 0;
  closed = false;
  pending: { job: Command; seq: number } | null = null;
  flight: Promise<void> | null = null;
  row: number;
  content: number;
  note: Note;
  encounter: Encounter;
  private send: (j: Command) => Promise<Result>;
  private changed: () => void;
  private error: (e: unknown) => void;
  constructor(
    note: Note,
    encounter: Encounter,
    send: (j: Command) => Promise<Result>,
    changed: () => void,
    error: (e: unknown) => void,
  ) {
    this.note = note;
    this.encounter = encounter;
    this.send = send;
    this.changed = changed;
    this.error = error;
    this.fields = { ...note.draft!.fields };
    this.row = note.row_version;
    this.content = note.content_version;
  }
  get dirty() {
    return this.seq !== this.ack || this.status === "saving" || !!this.pending;
  }
  edit(key: string, value: string) {
    if (this.closed) return;
    this.fields = { ...this.fields, [key]: value };
    this.seq++;
    if (
      !["conflict", "saving"].includes(this.status) &&
      !(this.status === "failed" && this.pending)
    )
      this.status = "unsaved";
    this.changed();
  }
  replace(fields: Fields) {
    this.fields = { ...fields };
    this.seq++;
    this.status = "unsaved";
    this.changed();
  }
  envelope(command: string, payload: Record<string, unknown>): Command {
    return {
      encounter_id: this.encounter.encounter_id,
      note_id: this.note.note_id,
      request_id: crypto.randomUUID(),
      row_version: this.row,
      assignment_version: this.note.assignment_version,
      membership_version: this.note.membership_version,
      command,
      payload,
    };
  }
  flush() {
    if (this.closed || this.status === "conflict") return Promise.resolve();
    if (this.flight) return this.flight;
    this.flight = this.drain().finally(() => {
      this.flight = null;
    });
    return this.flight;
  }
  private async drain() {
    while (!this.closed && (this.seq !== this.ack || this.pending)) {
      const job = this.pending || {
        job: this.envelope("save_draft", { fields: { ...this.fields } }),
        seq: this.seq,
      };
      this.pending = job;
      this.status = "saving";
      this.changed();
      try {
        const r = await this.send(job.job);
        if (this.closed) return;
        this.row = r.row_version;
        this.content = r.content_version;
        this.ack = job.seq;
        this.pending = null;
        this.status = this.seq === this.ack ? "saved" : "unsaved";
        this.changed();
      } catch (e) {
        if (this.closed) return;
        if (
          e instanceof ApiError &&
          ["VERSION_CONFLICT", "INVALID_STATE"].includes(e.code)
        ) {
          this.pending = null;
          this.status = "conflict";
        } else {
          if (e instanceof ApiError && e.code !== "TRANSIENT_FAILURE")
            this.pending = null;
          this.status = "failed";
        }
        this.changed();
        this.error(e);
        return;
      }
    }
  }
  close() {
    this.closed = true;
    this.fields = {};
    this.note = { ...this.note, draft: null, revisions: [], reviews: [] };
    this.encounter = { ...this.encounter, author_context: null, notes: [] };
    this.pending = null;
  }
}
