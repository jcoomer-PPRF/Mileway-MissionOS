import type { Output } from "./api";
/** Plain UTF-8 text, never HTML. Each structured field appears once. */
export function outputText(o: Output): string {
  const f = o.snapshot.fields,
    c = o.snapshot.context;
  const sections: [string, [string, string][]][] = [
    ["S · Subjective", [["Person’s report", f.subjective]]],
    [
      "O · Objective",
      [
        ["Staff observations", f.objective],
        ["Peer intervention", f.intervention],
      ],
    ],
    [
      "A · Peer-support reflection",
      [
        ["Reflection", f.assessment],
        ["Person’s response", f.response],
        ["Goal connection", f.goal_connection],
      ],
    ],
    ["P · Plan", [["Chosen next steps", f.plan]]],
  ];
  const lines = [
    "FICTIONAL TRAINING DATA — NOT A SERVICE RECORD — NOT SIGNED",
    "MissionOS peer-support SOAP training note",
    `Note: ${o.note_id}`,
    `Encounter: ${o.encounter_id}`,
    `Revision: ${o.revision}`,
    `Submitted: ${o.submitted_at}`,
    `Submitted by: ${o.submitted_by}`,
    `Original author: ${o.original_author_id}`,
    `Review: ${o.review?.action === "accept" ? "Reviewed in pilot" : o.review?.action === "return" ? "Returned for revision" : "Awaiting review"}`,
    `Person: ${c.participant_label}`,
    `Service date: ${c.service_date}`,
    `Time zone: ${c.time_zone}`,
    `Goal: ${c.goal}`,
  ];
  if (o.parent_id)
    lines.push(
      `Correction of note: ${o.parent_id}`,
      `Correction reason: ${o.correction_reason}`,
    );
  if (o.review)
    lines.push(
      `Reviewer: ${o.review.actor_id}`,
      `Reviewed at: ${o.review.reviewed_at}`,
      ...(o.review.reason ? [`Reviewer reason: ${o.review.reason}`] : []),
    );
  for (const [title, parts] of sections) {
    lines.push("", title);
    for (const [label, value] of parts) lines.push(label + ":", value);
  }
  lines.push("", "FICTIONAL TRAINING DATA — NOT A SERVICE RECORD — NOT SIGNED");
  return lines.join("\n");
}
