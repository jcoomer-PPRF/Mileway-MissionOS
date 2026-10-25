import test from "node:test";
import assert from "node:assert/strict";
import { DraftSession } from "../src/features/mission-delivery/persistent/draft";
import {
  ApiError,
  type Command,
  type Note,
  type Encounter,
  type Result,
} from "../src/features/mission-delivery/persistent/api";
const note = {
  note_id: "n",
  row_version: 1,
  content_version: 1,
  assignment_version: 1,
  membership_version: 1,
  draft: { fields: { subjective: "" } },
} as unknown as Note;
const encounter = { encounter_id: "e" } as Encounter;
const result = (job: Command): Result => ({
  note_id: "n",
  state: "draft",
  row_version: job.row_version + 1,
  content_version: job.row_version + 1,
  revision: 0,
  assignment_version: 1,
  membership_version: 1,
  server_time: "2026-10-25T00:00:00Z",
});
test("a delayed acknowledgement preserves later edits and serializes the next save", async () => {
  const jobs: Command[] = [];
  let release!: (r: Result) => void;
  let active = 0,
    max = 0;
  const m = new DraftSession(
    note,
    encounter,
    async (j) => {
      jobs.push(j);
      active++;
      max = Math.max(active, max);
      const r =
        jobs.length === 1
          ? await new Promise<Result>((r) => (release = r))
          : result(j);
      active--;
      return r;
    },
    () => {},
    () => {},
  );
  m.edit("subjective", "TRAINING first");
  const p = m.flush();
  m.edit("subjective", "TRAINING later");
  assert.equal(m.status, "saving");
  release(result(jobs[0]));
  await p;
  assert.equal(m.fields.subjective, "TRAINING later");
  assert.equal(jobs.length, 2);
  assert.equal(max, 1);
  assert.equal(jobs[1].row_version, 2);
  assert.equal(m.status, "saved");
});
test("uncertain network failure retries the exact ID and payload before saving newer edits", async () => {
  const jobs: Command[] = [];
  const m = new DraftSession(
    note,
    encounter,
    async (j) => {
      jobs.push(j);
      if (jobs.length === 1) throw new ApiError("TRANSIENT_FAILURE");
      return result(j);
    },
    () => {},
    () => {},
  );
  m.edit("subjective", "TRAINING sent");
  await m.flush();
  m.edit("subjective", "TRAINING later");
  await m.flush();
  assert.deepEqual(jobs[0], jobs[1]);
  assert.notEqual(jobs[1].request_id, jobs[2].request_id);
  assert.equal(m.fields.subjective, "TRAINING later");
  assert.equal(m.status, "saved");
});
test("a conflict does not send an overwrite or retry automatically", async () => {
  let n = 0;
  const m = new DraftSession(
    note,
    encounter,
    async () => {
      n++;
      throw new ApiError("VERSION_CONFLICT");
    },
    () => {},
    () => {},
  );
  m.edit("subjective", "TRAINING local");
  await m.flush();
  await m.flush();
  assert.equal(n, 1);
  assert.equal(m.status, "conflict");
  assert.equal(m.fields.subjective, "TRAINING local");
});
test("a rejected invalid save can be corrected without replaying the rejected payload forever", async () => {
  const jobs: Command[] = [];
  const m = new DraftSession(
    note,
    encounter,
    async (j) => {
      jobs.push(j);
      if (jobs.length === 1) throw new ApiError("VALIDATION_FAILED");
      return result(j);
    },
    () => {},
    () => {},
  );
  m.edit("subjective", "TRAINING invalid");
  await m.flush();
  m.edit("subjective", "TRAINING corrected");
  await m.flush();
  assert.equal(jobs.length, 2);
  assert.notEqual(jobs[0].request_id, jobs[1].request_id);
  assert.equal(m.status, "saved");
});
test("closing a draft clears prose and ignores a late private response", async () => {
  let release!: (r: Result) => void;
  let job!: Command;
  const m = new DraftSession(
    note,
    encounter,
    async (j) => {
      job = j;
      return await new Promise<Result>((r) => (release = r));
    },
    () => {},
    () => {},
  );
  m.edit("subjective", "TRAINING private");
  const p = m.flush();
  m.close();
  release(result(job));
  await p;
  assert.deepEqual(m.fields, {});
  assert.equal(m.pending, null);
  assert.equal(m.note.draft, null);
  assert.equal(m.encounter.author_context, null);
});
