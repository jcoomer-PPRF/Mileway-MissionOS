import test from "node:test";
import assert from "node:assert/strict";
import { outputText } from "../src/features/mission-delivery/persistent/output";
import type { Output } from "../src/features/mission-delivery/persistent/api";
const fields = Object.fromEntries(
  [
    "subjective",
    "objective",
    "assessment",
    "plan",
    "intervention",
    "response",
    "goal_connection",
  ].map((k, i) => [k, "TRAINING_UNIQUE_FIELD_" + i]),
);
const sample = {
  note_id: "note",
  encounter_id: "encounter",
  revision: 2,
  submitted_at: "2026-10-25",
  submitted_by: "author",
  original_author_id: "author",
  parent_id: null,
  correction_reason: null,
  snapshot: {
    fields,
    context: {
      participant_label: "TRAINING ALPHA",
      service_date: "2026-10-25",
      time_zone: "America/Indiana/Indianapolis",
      goal: "TRAINING goal",
    },
    watermark: "FICTIONAL",
  },
  review: {
    action: "accept",
    reason: null,
    actor_id: "reviewer",
    reviewed_at: "2026-10-25",
  },
} as Output;
test("SOAP output includes each structured field once in its mapped section", () => {
  const text = outputText(sample);
  for (const v of Object.values(fields))
    assert.equal(text.split(v).length - 1, 1);
  assert(text.indexOf("Peer intervention:") > text.indexOf("O · Objective"));
  assert(
    text.indexOf("Person’s response:") >
      text.indexOf("A · Peer-support reflection"),
  );
  assert.equal(
    text.split("FICTIONAL TRAINING DATA — NOT A SERVICE RECORD — NOT SIGNED")
      .length - 1,
    2,
  );
  assert(text.includes("Revision: 2"));
  assert(text.includes("Reviewed in pilot"));
});
test("untrusted markup stays literal text rather than becoming an HTML export", () => {
  const text = outputText({
    ...sample,
    snapshot: {
      ...sample.snapshot,
      fields: {
        ...fields,
        subjective: "<script>TRAINING_markup</script> & text",
      },
    },
  });
  assert(text.includes("<script>TRAINING_markup</script> & text"));
  assert(!text.startsWith("<"));
});
test("correction and return context identify the exact snapshot without legal signing", () => {
  const text = outputText({
    ...sample,
    parent_id: "original",
    correction_reason: "TRAINING reason",
    review: {
      action: "return",
      reason: "TRAINING clarify",
      actor_id: "reviewer",
      reviewed_at: "2026-10-25",
    },
  });
  assert(text.includes("Correction of note: original"));
  assert(text.includes("Reviewer reason: TRAINING clarify"));
  assert(text.includes("Returned for revision"));
  assert(text.endsWith("NOT SIGNED"));
});
