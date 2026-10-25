import { useEffect, useRef, useState } from "react";
import * as api from "./api";
import { outputText } from "./output";
const box =
  "mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6";
const button =
  "min-h-11 rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-50";
const secondary =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 disabled:opacity-50";
export type ActionKind =
  | "check_source"
  | "submit_note"
  | "return_note"
  | "accept_note"
  | "start_correction";
export function ReviewActions({
  note,
  viewing,
  busy,
  pending,
  act,
  activeCorrection,
  onOpen,
  onDirty,
}: {
  note: api.Note;
  viewing: number | null;
  busy: boolean;
  pending: boolean;
  act: (k: ActionKind, p?: Record<string, unknown>) => Promise<void>;
  activeCorrection?: string;
  onOpen: (id: string) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    onDirty(reason.length > 0);
    return () => onDirty(false);
  }, [reason, onDirty]);
  useEffect(() => setReason(""), [note.note_id, note.state]);
  const latest = note.revisions.slice(-1)[0]?.number;
  const exact = viewing === null || viewing === latest;
  const disabled = busy || pending;
  const reasonValid =
    reason.trim().length > 0 && Array.from(reason).length <= 4000;
  return (
    <>
      {note.state === "in_review" && note.access.can_review && (
        <section className={box} aria-label="Reviewer actions">
          <h2 className="text-xl font-bold">Review revision {latest}</h2>
          <p className="my-3">
            Return this exact submitted revision with a reason, or mark it
            reviewed in this fictional pilot. Note text stays unchanged.
          </p>
          {!exact && (
            <p className="mb-3 font-semibold text-amber-900">
              Open the latest revision to make a review decision.
            </p>
          )}
          <label className="block font-semibold" htmlFor="review-reason">
            Reason for return
          </label>
          <textarea
            id="review-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={disabled || !exact}
            rows={3}
            className="my-2 block w-full rounded-lg border p-3"
          />
          <p className="mb-3 text-sm text-slate-500">
            A reason is required for return. {Array.from(reason).length} / 4,000
            characters
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              className={secondary}
              disabled={disabled || !exact || !reasonValid}
              onClick={() =>
                void act("return_note", { revision: latest, reason })
              }
            >
              Return revision {latest}
            </button>
            <button
              className={button}
              disabled={disabled || !exact}
              onClick={() => void act("accept_note", { revision: latest })}
            >
              Accept revision {latest} in pilot
            </button>
          </div>
        </section>
      )}
      {note.state === "reviewed" && note.access.can_correct && (
        <section className={box} aria-label="Correction">
          <h2 className="text-xl font-bold">Correction to reviewed note</h2>
          <p className="my-3">
            The reviewed note remains locked. A correction creates a new linked
            draft with its own submissions and review.
          </p>
          {activeCorrection ? (
            <button
              className={secondary}
              onClick={() => onOpen(activeCorrection)}
            >
              Open active correction
            </button>
          ) : (
            <>
              <label
                htmlFor="correction-reason"
                className="block font-semibold"
              >
                Correction reason
              </label>
              <textarea
                id="correction-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={disabled}
                rows={3}
                className="my-2 block w-full rounded-lg border p-3"
              />
              <button
                className={button}
                disabled={disabled || !reasonValid}
                onClick={() => void act("start_correction", { reason })}
              >
                Start linked correction
              </button>
            </>
          )}
        </section>
      )}
    </>
  );
}
export function RevisionPreview({
  note,
  revision,
  onError,
}: {
  note: api.Note;
  revision: number;
  onError: (e: unknown) => void;
}) {
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setText("");
    setBusy(false);
    setNotice("");
    return () => {
      generation.current++;
    };
  }, [note.note_id, note.row_version, revision]);
  async function load(mode: "preview" | "export") {
    const g = generation.current;
    setBusy(true);
    setNotice("");
    try {
      const o = await api.output(note.note_id, revision, mode);
      if (g !== generation.current) return;
      const body = outputText(o);
      setText(body);
      if (mode === "export") {
        const url = URL.createObjectURL(
          new Blob([body], { type: "text/plain;charset=utf-8" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = `MissionOS_TRAINING_${note.note_id.slice(0, 8)}_revision_${revision}.txt`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice(
          "Download requested. This fictional, unsigned copy cannot be recalled after download.",
        );
      }
    } catch (e) {
      if (g === generation.current) onError(e);
    } finally {
      if (g === generation.current) setBusy(false);
    }
  }
  return (
    <section className={box} aria-label="Note preview and export">
      <h2 className="text-xl font-bold">Preview revision {revision}</h2>
      <p className="my-3">
        Preview and export use this immutable submitted revision. All copies are
        fictional, unsigned and not service records.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          className={secondary}
          disabled={busy}
          onClick={() => void load("preview")}
        >
          Open training preview
        </button>
        <button
          className={button}
          disabled={busy || !note.access.can_export}
          onClick={() => void load("export")}
        >
          Download training note (.txt)
        </button>
        {text && (
          <button
            className={secondary}
            onClick={() => {
              generation.current++;
              setBusy(false);
              setText("");
              setNotice("");
            }}
          >
            Close preview
          </button>
        )}
      </div>
      {!note.access.can_export && (
        <p className="mt-3 text-sm text-slate-600">
          Observer access permits preview only. Downloads are disabled.
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3">
          {notice}
        </p>
      )}
      {text && (
        <pre
          aria-label="Training note preview"
          className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-slate-50 p-4 font-sans text-sm"
        >
          {text}
        </pre>
      )}
    </section>
  );
}
