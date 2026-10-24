import { useReducer, useState, useRef, useEffect, type Dispatch } from 'react';
import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ClipboardList,
  Eye,
  FileText,
  RotateCcw,
  ShieldCheck,
  LayoutDashboard,
  X,
  Download,
  CheckCircle2,
} from 'lucide-react';
import { AppShell, type NavigationGroup } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  DEMO_CASES,
  FIELD_DEFINITIONS,
  TEMPLATE,
  STATUS_LABELS,
  demoReducer,
  initialDemoState,
  missingFields,
  canEdit,
  previewText,
  type DemoState,
  type DemoAction,
  type DemoStatus,
  type CaseId,
  type DemoRole,
} from './model';

type DemoProps = { state: DemoState; dispatch: Dispatch<DemoAction> };
const linkButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-emerald-600';
const panel = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6';

function NoteStatus({ status }: { status: DemoStatus }) {
  return (
    <span
      className={cn(
        'inline-block rounded-full px-3 py-1 text-xs font-semibold',
        status === 'returned'
          ? 'bg-amber-100 text-amber-900'
          : status === 'reviewed'
            ? 'bg-emerald-100 text-emerald-900'
            : 'bg-slate-100 text-slate-700',
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function MissionDeliveryDemo() {
  const [state, dispatch] = useReducer(demoReducer, undefined, initialDemoState);
  const groups: NavigationGroup[] = [
    {
      label: 'Mission Delivery',
      items: [
        { to: '/', label: 'My Day', icon: CalendarDays },
        { to: '/notes', label: 'Notes', icon: FileText },
        ...(state.role === 'reviewer'
          ? [{ to: '/review', label: 'Review Queue', icon: ShieldCheck }]
          : []),
      ],
    },
    {
      label: 'Operations',
      items: [{ to: '/operations', label: 'Fleet & operations', icon: LayoutDashboard }],
    },
  ];
  function reset() {
    if (
      window.confirm(
        'Clear all fictional drafts and simulated review history? This cannot be undone.',
      )
    )
      dispatch({ type: 'reset' });
  }
  return (
    <AppShell
      groups={groups}
      footer={
        <>
          <p className="font-semibold text-slate-700">MD01 · Design preview</p>
          <p className="mt-2 leading-5">
            Proposed workflow. Review actions are simulated and create no signed record.
          </p>
        </>
      }
      header={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p className="hidden text-sm font-medium text-slate-500 xl:block">
            Peer-support documentation
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
              Demo role
              <select
                value={state.role}
                onChange={(e) => dispatch({ type: 'role', role: e.target.value as DemoRole })}
                className="min-h-11 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900"
              >
                <option value="staff">Staff</option>
                <option value="reviewer">Reviewer</option>
                <option value="observer">Observer (read only)</option>
              </select>
            </label>
            <Button variant="secondary" onClick={reset} aria-label="Reset demo">
              <RotateCcw className="h-4 w-4" />
              <span className="hidden sm:inline">Reset demo</span>
            </Button>
          </div>
        </div>
      }
    >
      <div
        className="mb-7 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
        role="note"
      >
        <strong>Fictional workflow demonstration.</strong> Use test data only. Edits stay in this
        tab and clear on reload, reset or leaving the preview. Nothing is saved or signed.
      </div>
      <Routes>
        <Route path="/" element={<MyDay state={state} />} />
        <Route path="/notes" element={<Notes state={state} />} />
        <Route path="/notes/:id" element={<EncounterRoute state={state} dispatch={dispatch} />} />
        <Route path="/review" element={<ReviewQueue state={state} />} />
        <Route path="/operations" element={<OperationsPreview />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

function Heading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6">
      <p className="text-sm font-semibold text-emerald-700">{eyebrow}</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}

function OperationsPreview() {
  return (
    <>
      <Heading
        eyebrow="Operations"
        title="Fleet & operations"
        description="Fleet tools remain in the signed-in application, separate from these fictional practice notes."
      />
      <section className={panel}>
        <h2 className="text-lg font-semibold">Mileage, vehicles and organizational operations</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
          Trips, vehicles, maintenance, expenses, locations, reports and documents use your regular
          account. Open the current application in a new tab to keep this practice draft in place.
        </p>
        <a
          href="https://missionos.peerpoint.org/"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(linkButton, 'mt-5')}
        >
          Open current application (new tab)
          <ArrowRight className="h-4 w-4" />
        </a>
      </section>
    </>
  );
}

function MyDay({ state }: { state: DemoState }) {
  const notes = Object.values(state.notes);
  return (
    <>
      <Heading
        eyebrow="Mission Delivery"
        title="My Day"
        description="Start with the person’s goal. Capture what happened, draft the note, then practice a human review."
      />
      <div className="mb-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: 'Practice encounters', value: DEMO_CASES.length, icon: CalendarDays },
          {
            label: 'Drafts & returned notes',
            value: notes.filter((n) => n.status === 'draft' || n.status === 'returned').length,
            icon: ClipboardList,
          },
          {
            label: 'Awaiting simulated review',
            value: notes.filter((n) => n.status === 'in_review').length,
            icon: Eye,
          },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5"
          >
            <div>
              <p className="text-sm text-slate-500">{item.label}</p>
              <p className="mt-2 text-3xl font-semibold">{item.value}</p>
            </div>
            <item.icon className="h-6 w-6 text-emerald-700" aria-hidden="true" />
          </div>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Practice encounters</h2>
        <p className="text-sm text-slate-500">Training day · 24 October 2026</p>
      </div>
      <EncounterCards state={state} />
      <div className="mt-6 rounded-xl bg-emerald-950 p-6 text-emerald-50">
        <p className="text-sm font-semibold">A note starts with the person’s own words.</p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-100">
          This preview follows a typed SOAP workflow. Voice capture, watch capture, AI drafting and
          legal signing are future work.
        </p>
      </div>
    </>
  );
}

function EncounterCards({
  state,
  ids,
  review = false,
}: {
  state: DemoState;
  ids?: CaseId[];
  review?: boolean;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {DEMO_CASES.filter((item) => !ids || ids.includes(item.id)).map((item) => (
        <article key={item.id} className={panel}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-medium text-slate-500">
              {item.time} · {item.encounter}
            </span>
            <NoteStatus status={state.notes[item.id].status} />
          </div>
          <h3 className="text-lg font-semibold">{item.person}</h3>
          <p className="mt-1 text-sm text-slate-600">{item.title}</p>
          <div className="my-5 rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-500">Person’s stated goal</p>
            <p className="mt-1 text-sm leading-6">{item.goal}</p>
          </div>
          <Link to={`/notes/${item.id}`} className={linkButton}>
            {review ? 'Review encounter' : 'Open encounter'}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </article>
      ))}
    </div>
  );
}

function Notes({ state }: { state: DemoState }) {
  return (
    <>
      <Heading
        eyebrow="Mission Delivery"
        title="Notes"
        description="Drafts, practice revisions and simulated review results. These fictional notes are held only in memory."
      />
      <EncounterCards state={state} />
    </>
  );
}

function ReviewQueue({ state }: { state: DemoState }) {
  if (state.role !== 'reviewer')
    return (
      <section className={panel}>
        <h1 className="text-xl font-semibold">Reviewer view</h1>
        <p className="mt-3 text-sm text-slate-600">
          Choose Reviewer in the demo role selector to practice this step. Staff and Observer cannot
          review notes.
        </p>
      </section>
    );
  const ids = DEMO_CASES.filter((item) => state.notes[item.id].status === 'in_review').map(
    (item) => item.id,
  );
  return (
    <>
      <Heading
        eyebrow="Simulated reviewer workspace"
        title="Review Queue"
        description="Review the submitted snapshot against the fictional source. Accept in the demo or return it with a specific comment."
      />
      {ids.length ? (
        <EncounterCards state={state} ids={ids} review />
      ) : (
        <div className={panel}>
          <CheckCircle2 className="mb-3 h-6 w-6 text-emerald-700" />
          <h2 className="font-semibold">No notes awaiting simulated review</h2>
          <p className="mt-2 text-sm text-slate-600">
            Use the Staff demo role to complete and submit a practice draft.
          </p>
        </div>
      )}
    </>
  );
}

function EncounterRoute(props: DemoProps) {
  const { id } = useParams();
  const fixture = DEMO_CASES.find((item) => item.id === id);
  if (!fixture) return <Navigate to="/notes" replace />;
  return <EncounterEditor key={fixture.id} {...props} id={fixture.id} />;
}

function EncounterEditor({ state, dispatch, id }: DemoProps & { id: CaseId }) {
  const fixture = DEMO_CASES.find((item) => item.id === id)!;
  const note = state.notes[id];
  const editable = canEdit(state.role, note);
  const gaps = missingFields(note.fields);
  const [comment, setComment] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  function sample() {
    if (
      Object.values(note.fields).some((value) => value.trim()) &&
      !window.confirm('Replace this practice draft with the supplied sample facts?')
    )
      return;
    dispatch({ type: 'sample', id });
  }
  return (
    <>
      <Link
        to="/notes"
        className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-slate-600"
      >
        <ArrowLeft className="h-4 w-4" />
        All notes
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-emerald-700">
            {fixture.encounter} · {fixture.date}
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{fixture.person}</h1>
          <p className="mt-2 text-sm text-slate-600">{fixture.title}</p>
        </div>
        <Button variant="secondary" onClick={() => setShowPreview(true)}>
          <Eye className="h-4 w-4" />
          Preview note
        </Button>
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <NoteStatus status={note.status} />
        <span className="text-xs text-slate-500">
          {TEMPLATE.name} · {TEMPLATE.version}
        </span>
        {note.revision > 0 && (
          <span className="text-xs text-slate-500">Submitted revision {note.revision}</span>
        )}
      </div>
      {note.feedback && (
        <section
          className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-5"
          aria-label="Reviewer feedback"
        >
          <h2 className="text-sm font-semibold text-amber-950">Practice revision requested</h2>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-amber-950">
            {note.feedback}
          </p>
        </section>
      )}
      {note.status === 'reviewed' && (
        <p className="mb-5 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
          Accepted in the demonstration. This note is locked in this tab. It is not final, signed,
          sealed or a service record.
        </p>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <div className="space-y-5">
          <section className={panel} aria-label="Fictional source facts">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
              Source first
            </p>
            <h2 className="mt-2 text-lg font-semibold">Fictional source facts</h2>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              A scripted tabletop exercise, not an actual person or service. Only the supplied facts
              may be used.
            </p>
            <dl className="mt-5 space-y-4">
              {FIELD_DEFINITIONS.filter((field) => fixture.source[field.key]).map((field) => (
                <div key={field.key}>
                  <dt className="text-xs font-semibold text-slate-500">{field.label}</dt>
                  <dd className="mt-1 text-sm leading-6 text-slate-700">
                    {fixture.source[field.key]}
                  </dd>
                </div>
              ))}
            </dl>
            {fixture.missingSource.length > 0 && (
              <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
                <p className="font-semibold">Not supplied in this source</p>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  {fixture.missingSource.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p className="mt-3 text-xs leading-5">
                  Leave unsupported facts empty. Ask for the missing source information; do not
                  invent it.
                </p>
              </div>
            )}
            <p className="mt-4 text-xs leading-5 text-slate-500">
              Duration, billing eligibility and clinical findings are not supplied or inferred in
              this preview.
            </p>
          </section>
          <section className={panel} aria-label="Missing facts">
            <h2 className="font-semibold">Draft completeness</h2>
            <p className="mt-2 text-sm text-slate-600">
              {FIELD_DEFINITIONS.length - gaps.length} of {FIELD_DEFINITIONS.length} fields supplied
            </p>
            <div
              className="my-3 h-1.5 overflow-hidden rounded-full bg-slate-100"
              aria-hidden="true"
            >
              <div
                className="h-full bg-emerald-600"
                style={{ width: `${(1 - gaps.length / FIELD_DEFINITIONS.length) * 100}%` }}
              />
            </div>
            {gaps.length ? (
              <>
                <p className="text-xs font-medium text-slate-600">
                  Still needed before simulated submission:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-500">
                  {gaps.map((field) => (
                    <li key={field.key}>{field.label}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-emerald-800">
                Fields are present. Staff must still check every statement against the source.
              </p>
            )}
          </section>
        </div>
        <div className="space-y-5">
          <section className={panel} aria-label="SOAP note editor">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">SOAP draft</h2>
              {editable && (
                <Button variant="secondary" onClick={sample} size="sm">
                  Use supplied sample
                </Button>
              )}
            </div>
            <p className="mb-5 text-xs leading-5 text-slate-500">
              Typed input only. “Use supplied sample” copies the scripted facts; it does not
              generate or infer content.
            </p>
            {!editable && (
              <p className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                Read only in this role or review state. Submitted notes cannot be edited while
                awaiting simulated review.
              </p>
            )}
            <div className="space-y-5">
              {FIELD_DEFINITIONS.map((field) => (
                <div key={field.key}>
                  <label
                    htmlFor={`note-${field.key}`}
                    className="text-sm font-semibold text-slate-800"
                  >
                    {field.label}
                  </label>
                  <p
                    id={`help-${field.key}`}
                    className="mb-2 mt-1 text-xs leading-5 text-slate-500"
                  >
                    {field.help}
                  </p>
                  <Textarea
                    id={`note-${field.key}`}
                    aria-describedby={`help-${field.key}`}
                    value={note.fields[field.key]}
                    readOnly={!editable}
                    maxLength={6000}
                    onChange={(e) =>
                      dispatch({ type: 'edit', id, field: field.key, value: e.target.value })
                    }
                    placeholder="Only facts supported by the source…"
                    className="min-h-28 read-only:bg-slate-50"
                  />
                </div>
              ))}
            </div>
            {editable && (
              <div className="mt-6 border-t border-slate-100 pt-5">
                <label className="flex items-start gap-3 text-sm leading-6 text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 shrink-0 accent-emerald-700"
                    checked={note.verified}
                    onChange={(e) => dispatch({ type: 'verify', id, value: e.target.checked })}
                  />
                  I checked this draft against the fictional source facts.
                </label>
                <Button
                  className="mt-4 min-h-11 w-full sm:w-auto"
                  disabled={gaps.length > 0 || !note.verified}
                  onClick={() => dispatch({ type: 'submit', id, at: new Date().toISOString() })}
                >
                  Submit for simulated review
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  All seven fields and the source check are required. Editing clears the source
                  check.
                </p>
              </div>
            )}
          </section>
          {state.role === 'reviewer' && note.status === 'in_review' && (
            <section className={panel} aria-label="Simulated review">
              <h2 className="text-lg font-semibold">Simulated review · Revision {note.revision}</h2>
              <p className="mb-4 mt-2 text-sm leading-6 text-slate-600">
                Compare the submitted draft with the source. This is a practice review, not an
                approved signature workflow.
              </p>
              <label htmlFor="review-comment" className="text-sm font-medium">
                Comment for staff (required to return)
              </label>
              <Textarea
                id="review-comment"
                className="mt-2"
                value={comment}
                maxLength={2000}
                onChange={(e) => setComment(e.target.value)}
              />
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  variant="secondary"
                  disabled={!comment.trim()}
                  onClick={() => {
                    dispatch({ type: 'return', id, comment, at: new Date().toISOString() });
                    setComment('');
                  }}
                >
                  Return for practice revision
                </Button>
                <Button
                  onClick={() => dispatch({ type: 'accept', id, at: new Date().toISOString() })}
                >
                  Accept in demo
                </Button>
              </div>
            </section>
          )}
          {note.history.length > 0 && (
            <section className={panel} aria-label="Simulated review history">
              <h2 className="font-semibold">Simulated review history</h2>
              <p className="mt-1 text-xs text-slate-500">
                Practice activity only; not a persistent audit trail or signature.
              </p>
              <ol className="mt-4 space-y-4">
                {note.history.map((event, index) => (
                  <li key={index} className="border-l-2 border-emerald-200 pl-3 text-sm">
                    <p className="font-medium">
                      {event.action} · Revision {event.revision}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {event.actor} · {new Date(event.at).toLocaleTimeString()}
                    </p>
                    {event.comment && (
                      <p className="mt-2 whitespace-pre-wrap break-words text-slate-600">
                        {event.comment}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
      <PreviewDialog
        open={showPreview}
        close={() => setShowPreview(false)}
        text={previewText(id, note)}
        filename={`missionos-MD01-${fixture.encounter.replace(/ /g, '-')}-demo.txt`}
      />
    </>
  );
}

function PreviewDialog({
  open,
  close,
  text,
  filename,
}: {
  open: boolean;
  close: () => void;
  text: string;
  filename: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <dialog
      ref={ref}
      onCancel={close}
      aria-labelledby="preview-title"
      className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-xl border-0 p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/40"
    >
      <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-slate-200 bg-white p-5">
        <h2 id="preview-title" className="font-semibold">
          Fictional note preview
        </h2>
        <Button variant="ghost" size="icon" onClick={close} aria-label="Close preview">
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="p-5">
        <pre
          className="whitespace-pre-wrap break-words font-sans text-sm leading-6"
          data-testid="note-preview"
        >
          {text}
        </pre>
        <Button className="mt-5" variant="secondary" onClick={download}>
          <Download className="h-4 w-4" />
          Download demonstration text
        </Button>
      </div>
    </dialog>
  );
}
