import { useEffect, useRef, useState } from "react";
import { Menu, X, CalendarDays, FileText, LogOut, Compass } from "lucide-react";
import * as api from "./api";
import { DraftSession } from "./draft";
import { ReviewActions, RevisionPreview, type ActionKind } from "./ReviewTools";
const definitions = [
  [
    "subjective",
    "S · Subjective",
    "What the person reported; attribute statements.",
  ],
  [
    "objective",
    "O · Objective",
    "What staff directly observed; separate observation from interpretation.",
  ],
  [
    "assessment",
    "A · Peer-support reflection",
    "Reflect on the encounter without diagnosis or clinical conclusions.",
  ],
  [
    "plan",
    "P · Plan",
    "The person’s chosen next steps and agreed staff follow-up.",
  ],
  [
    "intervention",
    "Peer intervention",
    "What staff actually did within peer scope.",
  ],
  [
    "response",
    "Person’s response",
    "The stated or observed response to the intervention.",
  ],
  [
    "goal_connection",
    "Connection to the person’s goal",
    "How this encounter relates to the person’s self-directed goal.",
  ],
] as const;
const panel =
  "rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6";
const button =
  "min-h-11 rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50";
const secondary =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const label = (e: api.Encounter) =>
  e.encounter_id.endsWith("099") ? "TRAINING BETA" : "TRAINING ALPHA";
const stateLabel = (s: string) =>
  ({
    draft: "Draft",
    in_review: "Awaiting review",
    returned: "Returned for revision",
    reviewed: "Reviewed in pilot",
  })[s] || s;
const messages: Record<string, string> = {
  RATE_LIMITED:
    "Too many training sign-in attempts. Wait a minute before trying again.",
  VERSION_CONFLICT:
    "Another session changed this note. Compare your edits with the latest saved copy.",
  INVALID_STATE:
    "This note’s workflow changed. Reload the latest copy before continuing.",
  VALIDATION_FAILED:
    "Check the required fields and source information. The action was not accepted.",
  REQUEST_ID_REUSED:
    "The retry could not be accepted. Check the latest server state.",
  TRANSIENT_FAILURE:
    "Connection interrupted. Your edits remain in this page. Retry when the connection returns.",
};
export function PersistentPilot({ hostedStaging = false }: { hostedStaging?: boolean } = {}) {
  const [user, setUser] = useState<api.User | null>(null),
    [boot, setBoot] = useState(true),
    [checkingAccess, setCheckingAccess] = useState(false),
    [encounters, setEncounters] = useState<api.Encounter[]>([]),
    [tab, setTab] = useState("My Day"),
    [selected, setSelected] = useState<api.Encounter | null>(null),
    [note, setNote] = useState<api.Note | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [checked, setChecked] = useState(false),
    [comparison, setComparison] = useState<api.Note | null>(null),
    [pending, setPending] = useState<(() => void) | null>(null),
    [drawer, setDrawer] = useState(false),
    [actionPending, setActionPending] = useState<string | null>(null),
    [viewingRevision, setViewingRevision] = useState<number | null>(null),
    [reviewDirty, setReviewDirty] = useState(false);
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState("");
  const [, render] = useState(0);
  const model = useRef<DraftSession | null>(null),
    generation = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout>>(),
    menuRef = useRef<HTMLButtonElement>(null),
    drawerRef = useRef<HTMLElement>(null),
    dialogRef = useRef<HTMLDivElement>(null);
  const reasonDirtyRef = useRef(false);
  reasonDirtyRef.current = reviewDirty;
  const actionJob = useRef<{ kind: string; job: api.Command } | null>(null);
  const noteRef = useRef(note);
  noteRef.current = note;
  const userRef = useRef(user);
  userRef.current = user;
  function clear(text: string) {
    generation.current++;
    model.current?.close();
    model.current = null;
    actionJob.current = null;
    setActionPending(null);
    setReviewDirty(false);
    setUser(null);
    setNote(null);
    setSelected(null);
    setEncounters([]);
    setComparison(null);
    setPending(null);
    setBusy(false);
    setCheckingAccess(false);
    setMessage(text);
  }
  function handleError(e: unknown) {
    if (api.revoked(e)) {
      clear("Your session ended or access changed. Sign in again to continue.");
      return;
    }
    setMessage(
      messages[e instanceof api.ApiError ? e.code : "TRANSIENT_FAILURE"] ||
        messages.TRANSIENT_FAILURE,
    );
    if (model.current?.status === "conflict") {
      const id = model.current.note.note_id,
        g = generation.current;
      api
        .read(id)
        .then((n) => {
          if (g === generation.current) setComparison(n);
        })
        .catch((e) => {
          if (api.revoked(e))
            clear(
              "Your session ended or access changed. Sign in again to continue.",
            );
          else
            setMessage(
              "The latest copy could not be loaded. Your edits remain here. Reconnect and retry the comparison.",
            );
        });
    }
  }
  async function refresh() {
    const g = generation.current;
    const rows = await api.list();
    if (g === generation.current) {
      setEncounters(rows);
      setSelected((prev) =>
        prev
          ? rows.find((e) => e.encounter_id === prev.encounter_id) || prev
          : null,
      );
    }
    return rows;
  }
  useEffect(() => {
    let active = true;
    api
      .session()
      .then(async (u) => {
        if (!active) return;
        setUser(u);
        if (u) await refresh();
      })
      .catch(handleError)
      .finally(() => {
        if (active) setBoot(false);
      });
    return () => {
      active = false;
      model.current?.close();
    };
  }, []);
  useEffect(() => {
    if (!user) return;
    let active = true;
    const verify = async () => {
      const g = generation.current;
      try {
        const u = await api.session();
        if (!active || g !== generation.current) return;
        if (!u || u.id !== userRef.current?.id) {
          clear(
            "Your session ended or the signed-in account changed. Sign in again to continue.",
          );
          return;
        }
        const id = noteRef.current?.note_id;
        if (id) await api.read(id); // Permission check only; never overwrite local edits.
        if (active && g === generation.current) setCheckingAccess(false);
      } catch (e) {
        if (!active || g !== generation.current) return;
        if (api.revoked(e)) handleError(e);
        else
          setMessage(
            "Access could not be rechecked. Reconnect before reopening this page.",
          );
      }
    };
    const foreground = () => {
      if (document.visibilityState === "hidden") setCheckingAccess(true);
      else void verify();
    };
    const restored = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setCheckingAccess(true);
        void verify();
      }
    };
    const id = setInterval(() => void verify(), 10000);
    document.addEventListener("visibilitychange", foreground);
    window.addEventListener("pageshow", restored);
    window.addEventListener("online", verify);
    return () => {
      active = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", foreground);
      window.removeEventListener("pageshow", restored);
      window.removeEventListener("online", verify);
    };
  }, [user]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (model.current?.dirty || actionJob.current || reasonDirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const online = () => {
      if (model.current?.status === "failed") void model.current.flush();
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("online", online);
    };
  }, []);
  useEffect(() => {
    const el = pending ? dialogRef.current : drawer ? drawerRef.current : null;
    if (!el) return;
    const focusable = () =>
      Array.from(
        el.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input, textarea, [tabindex="0"]',
        ),
      );
    focusable()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        pending ? setPending(null) : setDrawer(false);
        menuRef.current?.focus();
      }
      if (e.key === "Tab") {
        const f = focusable(),
          first = f[0],
          last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    el.addEventListener("keydown", trap);
    return () => el.removeEventListener("keydown", trap);
  }, [!!pending, drawer]);
  function install(n: api.Note, e: api.Encounter) {
    model.current?.close();
    setNote(n);
    setReviewDirty(false);
    setViewingRevision(null);
    setChecked(!!n.draft?.checked);
    setComparison(null);
    actionJob.current = null;
    setActionPending(null);
    if (n.draft && ["draft", "returned"].includes(n.state))
      model.current = new DraftSession(
        n,
        e,
        api.command,
        () => render((x) => x + 1),
        handleError,
      );
    else model.current = null;
  }
  async function open(e: api.Encounter, requestedNote?: string) {
    setBusy(true);
    setMessage("");
    const g = ++generation.current;
    model.current?.close();
    model.current = null;
    setNote(null);
    setSelected(e);
    try {
      let id =
        requestedNote ||
        e.notes
          .filter((n) => ["draft", "returned"].includes(n.state))
          .slice(-1)[0]?.note_id ||
        e.notes.slice(-1)[0]?.note_id;
      if (!id) {
        const r = await api.command({
          encounter_id: e.encounter_id,
          note_id: null,
          request_id: crypto.randomUUID(),
          row_version: 0,
          assignment_version: e.assignment_version,
          membership_version: e.membership_version,
          command: "create_note",
          payload: {},
        });
        id = r.note_id;
      }
      const n = await api.read(id);
      if (g === generation.current) {
        install(n, e);
        await refresh();
      }
    } catch (err) {
      if (g === generation.current) handleError(err);
    } finally {
      if (g === generation.current) setBusy(false);
    }
  }
  function navigate(fn: () => void) {
    if (busy) {
      setMessage("Wait for the current request to finish before leaving.");
      return;
    }
    if (model.current?.dirty || actionJob.current || reasonDirtyRef.current) {
      setPending(() => fn);
      return;
    }
    fn();
    setDrawer(false);
  }
  function home(next: string) {
    navigate(() => {
      generation.current++;
      model.current?.close();
      model.current = null;
      setNote(null);
      setSelected(null);
      setTab(next);
      setComparison(null);
      setMessage("");
      void refresh().catch(handleError);
    });
  }
  function edit(key: string, value: string) {
    if (busy || actionJob.current) return;
    setChecked(false);
    model.current?.edit(key, value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const m = model.current;
      if (m && m.status === "unsaved") void m.flush();
    }, 1000);
  }
  async function act(kind: ActionKind, payload: Record<string, unknown> = {}) {
    const m = model.current;
    if (!note || !selected) return;
    setBusy(true);
    setMessage("");
    const g = generation.current;
    try {
      if (m) {
        await m.flush();
        if (m.status !== "saved") return;
      }
      const data =
        kind === "check_source"
          ? {
              content_version: m?.content ?? note.content_version,
              attested: true,
            }
          : payload;
      const job =
        actionJob.current?.kind === kind
          ? actionJob.current.job
          : {
              encounter_id: selected.encounter_id,
              note_id: note.note_id,
              request_id: crypto.randomUUID(),
              row_version: m?.row ?? note.row_version,
              assignment_version: note.assignment_version,
              membership_version: note.membership_version,
              command: kind,
              payload: data,
            };
      actionJob.current = { kind, job };
      setActionPending(kind);
      const r = await api.command(job);
      if (g === generation.current) {
        actionJob.current = null;
        setActionPending(null);
        const n = await api.read(r.note_id);
        if (g === generation.current) {
          install(n, selected);
          await refresh();
          setMessage(
            (
              {
                submit_note:
                  "Submitted. This revision is locked and available to the assigned reviewer.",
                check_source: "Source check recorded for this saved version.",
                return_note:
                  "Revision returned with your reason. The author can revise and resubmit.",
                accept_note:
                  "Revision reviewed in pilot. The note remains unsigned and is not a service record.",
                start_correction:
                  "Linked correction draft created. The reviewed original is unchanged.",
              } as Record<string, string>
            )[kind],
          );
        }
      }
    } catch (e) {
      if (g === generation.current) {
        if (e instanceof api.ApiError && e.code !== "TRANSIENT_FAILURE") {
          actionJob.current = null;
          setActionPending(null);
          if (m && ["VERSION_CONFLICT", "INVALID_STATE"].includes(e.code))
            m.status = "conflict";
        }
        handleError(e);
      }
    } finally {
      if (g === generation.current) setBusy(false);
    }
  }
  async function reload() {
    if (!selected || !note) return;
    setBusy(true);
    const g = generation.current;
    try {
      const n = await api.read(note.note_id);
      if (g === generation.current) {
        install(n, selected);
        setMessage("Latest server state loaded.");
      }
    } catch (e) {
      if (g === generation.current) handleError(e);
    } finally {
      if (g === generation.current) setBusy(false);
    }
  }
  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    generation.current++;
    let authenticated = false;
    try {
      const u = await api.login(username, password);
      authenticated = true;
      setPassword("");
      setUser(u);
      await refresh();
    } catch (err) {
      setPassword("");
      if (!authenticated && api.revoked(err)) {
        clear(
          "Sign-in was not accepted. Check your training username, password and account access.",
        );
      } else {
        handleError(err);
      }
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    setBusy(true);
    try {
      await api.logout();
      clear(hostedStaging ? "Signed out. Saved fictional notes remain in isolated staging." : "Signed out. Saved training notes remain in the local database.");
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }
  const m = model.current;
  const historical =
    viewingRevision === null
      ? null
      : note?.revisions.find((r) => r.number === viewingRevision);
  const fields =
    historical?.snapshot.fields ||
    m?.fields ||
    note?.draft?.fields ||
    note?.revisions.slice(-1)[0]?.snapshot.fields;
  const context =
    historical?.snapshot.context ||
    note?.draft?.context ||
    note?.revisions.slice(-1)[0]?.snapshot.context ||
    selected?.author_context;
  const filled = definitions.filter(([k]) => fields?.[k]?.trim()).length;
  const editable = !!m && !historical && !busy && !actionPending;
  const status = historical ? "saved" : m?.status || "saved";
  if (boot) return <main className="p-8">Loading training session…</main>;
  if (!user)
    return (
      <main className="min-h-screen bg-slate-100 p-5 sm:p-10">
        <section className={panel + " mx-auto max-w-lg"}>
          <h1 className="text-3xl font-bold">MissionOS</h1>
          <p className="mt-2 font-semibold text-emerald-800">
            {hostedStaging ? "MD02 hosted staging" : "MD02 local training"}
          </p>
          <p className="my-5 text-slate-600">
            Fictional data only. Service records remain in OneStep. Use the
            separate training login supplied with this preview.
          </p>

          {message && (
            <p role="alert" className="mb-4 text-amber-900">
              {message}
            </p>
          )}
          <form onSubmit={signIn} className="space-y-4">
            <label className="block font-semibold">
              Training username
              <input
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 block w-full rounded-lg border p-3"
              />
            </label>
            <label className="block font-semibold">
              Training password
              <input
                autoComplete="current-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border p-3"
              />
            </label>
            <button className={button} disabled={busy}>
              Sign in
            </button>
          </form>
        </section>
      </main>
    );
  if (checkingAccess)
    return (
      <main className="min-h-screen bg-slate-100 p-8">
        <h1 className="text-2xl font-bold">Checking training access</h1>
        <p className="my-4">
          Your local edits remain in memory while this page checks the current
          session.
        </p>
        <button
          className={secondary}
          onClick={() => window.dispatchEvent(new Event("online"))}
        >
          Retry access check
        </button>
      </main>
    );
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b bg-white px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            ref={menuRef}
            className={secondary + " md:hidden"}
            aria-label="Open navigation"
            aria-expanded={drawer}
            onClick={() => setDrawer(true)}
          >
            <Menu size={20} />
          </button>
          <Compass className="text-emerald-700" />
          <span className="text-xl font-bold">MissionOS</span>
          <span className="hidden text-sm text-slate-500 sm:inline">
            Peer Point
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm sm:inline">{user.label}</span>
          <button
            className={secondary}
            onClick={() => navigate(() => void signOut())}
            aria-label="Sign out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>
      {drawer && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/40 md:hidden"
          onClick={() => {
            setDrawer(false);
            menuRef.current?.focus();
          }}
        />
      )}
      <aside
        ref={drawerRef}
        aria-label="Mission Delivery navigation"
        className={
          (drawer ? "fixed inset-y-0 left-0 z-40 block w-72" : "hidden") +
          " border-r bg-white p-5 md:fixed md:inset-y-16 md:left-0 md:block md:w-60"
        }
      >
        <div className="mb-6 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Mission Delivery
          </p>
          <button
            className="p-2 md:hidden"
            aria-label="Close navigation"
            onClick={() => {
              setDrawer(false);
              menuRef.current?.focus();
            }}
          >
            <X />
          </button>
        </div>
        {[
          "My Day",
          "Notes",
          ...(user.username === "training-reviewer" ? ["Review Queue"] : []),
        ].map((t, i) => (
          <button
            key={t}
            className={
              "mb-2 flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left font-semibold " +
              (tab === t
                ? "bg-emerald-50 text-emerald-800"
                : "text-slate-600 hover:bg-slate-50")
            }
            onClick={() => home(t)}
          >
            {i === 0 ? <CalendarDays size={21} /> : <FileText size={21} />} {t}
          </button>
        ))}
        <p className="mt-8 text-sm text-slate-500">
          {user.label}
          <br />
          Local fictional training
        </p>
      </aside>
      <main className="mx-auto max-w-6xl p-4 sm:p-7 md:ml-60">
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <strong>
            FICTIONAL TRAINING DATA · NOT A SERVICE RECORD · NOT SIGNED
          </strong>
          <p>
            {hostedStaging ? "Saved fictional drafts stay in isolated Supabase staging." : "Saved drafts stay in the disposable local database."} Unsaved edits
            exist only in this page and can be lost if it is forcibly closed.
          </p>
        </div>
        {user.username === "training-observer" && (
          <p className="mb-5 rounded-lg border bg-white p-4 font-semibold">
            Observer mode · read only. Submitted snapshots may be previewed;
            drafting, review decisions and export are disabled.
          </p>
        )}
        {message && (
          <p
            role="alert"
            className="mb-5 rounded-lg border border-amber-200 bg-white p-4"
          >
            {message}
          </p>
        )}
        {!selected ? (
          <>
            <p className="font-semibold text-emerald-800">Mission Delivery</p>
            <h1 className="mb-2 text-3xl font-bold">{tab}</h1>
            <p className="mb-6 text-slate-600">
              {tab === "My Day"
                ? "Your assigned training encounters and documentation."
                : "Saved training notes and submitted revisions."}
            </p>
            <button
              className={secondary + " mb-5"}
              onClick={() => void refresh().catch(handleError)}
            >
              Refresh assignments
            </button>
            {!encounters.length && (
              <p className={panel}>
                No training encounters are assigned to this account.
              </p>
            )}
            <div className="grid gap-5 lg:grid-cols-2">
              {encounters
                .filter(
                  (e) =>
                    tab === "My Day" ||
                    (tab === "Review Queue"
                      ? e.notes.some((n) => n.state === "in_review")
                      : e.notes.length),
                )
                .map((e) => (
                  <article key={e.encounter_id} className={panel}>
                    <h2 className="text-xl font-bold">{label(e)}</h2>
                    <p className="mt-2 text-slate-600">
                      {e.author_context?.known_source_gap
                        ? "Missing source facts need clarification."
                        : e.author_context
                          ? "Peer-support SOAP draft"
                          : user.username === "training-observer"
                            ? "Observer · submitted history only"
                            : "Assigned reviewer · submitted history only"}
                    </p>
                    <p className="my-4 font-semibold">
                      {e.notes.length
                        ? stateLabel(e.notes.slice(-1)[0]!.state)
                        : "Not started"}
                    </p>
                    <button
                      className={button}
                      disabled={busy || (!e.author_context && !e.notes.length)}
                      onClick={() => navigate(() => void open(e))}
                    >
                      {e.author_context
                        ? "Open encounter"
                        : "Open submitted note"}
                    </button>
                  </article>
                ))}
            </div>
          </>
        ) : (
          <>
            <button className={secondary + " mb-4"} onClick={() => home(tab)}>
              Back to {tab}
            </button>
            {note && (
              <button
                className={secondary + " mb-4 ml-3"}
                disabled={busy}
                onClick={() => navigate(() => void reload())}
              >
                Refresh note
              </button>
            )}
            <h1 className="text-3xl font-bold">{label(selected)}</h1>
            {note?.parent_id && (
              <p className="mt-3 font-semibold text-emerald-800">
                Linked correction · {note.correction_reason}
              </p>
            )}
            {historical && (
              <p className="mt-3 font-semibold text-amber-900">
                Viewing immutable revision {historical.number}. Editing is
                disabled.
              </p>
            )}
            <p className="mb-6 mt-2 text-slate-600">
              {note
                ? stateLabel(note.state)
                : busy
                  ? "Opening encounter…"
                  : "Encounter could not be loaded."}
            </p>
            {!note && !busy && (
              <button
                className={secondary + " mb-4"}
                onClick={() =>
                  void refresh()
                    .then((rows) => {
                      const e = rows.find(
                        (e) => e.encounter_id === selected.encounter_id,
                      );
                      if (e) return open(e);
                      throw new api.ApiError("NOT_FOUND_OR_NOT_ALLOWED");
                    })
                    .catch(handleError)
                }
              >
                Retry loading encounter
              </button>
            )}
            {context && (
              <section
                className={panel + " mb-5"}
                aria-label="Source information"
              >
                <h2 className="text-xl font-bold">Encounter source and goal</h2>
                <p className="mt-2">
                  <strong>Goal:</strong> {context.goal}
                </p>
                <p className="mt-3 whitespace-pre-wrap">
                  {context.source_text}
                </p>
                {context.known_source_gap && (
                  <p className="mt-4 font-semibold text-amber-900">
                    Known source gaps remain unresolved. Filling the note does
                    not clear them. Submission is blocked.
                  </p>
                )}
                <p className="mt-3 text-sm text-slate-500">
                  {context.service_date} · {context.time_zone} · Peer-support
                  training
                </p>
              </section>
            )}
            {note && fields && (
              <>
                <section
                  className={panel + " mb-5"}
                  aria-label="Draft completeness"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-bold">Draft completeness</h2>
                      <p className="mt-1">{filled} of 7 fields supplied</p>
                    </div>
                    <span
                      role="status"
                      aria-live="polite"
                      className={
                        "rounded-full px-3 py-2 font-semibold " +
                        (status === "saved"
                          ? "bg-emerald-50 text-emerald-800"
                          : "bg-amber-50 text-amber-900")
                      }
                    >
                      {
                        (
                          {
                            saved: "Saved",
                            unsaved: "Unsaved changes",
                            saving: "Saving…",
                            failed: "Save failed",
                            conflict: "Conflict",
                          } as const
                        )[status]
                      }
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">
                    Completeness shows supplied fields. It does not certify
                    accuracy, service eligibility, or documentation quality.
                  </p>
                  {status === "failed" && (
                    <button
                      className={secondary + " mt-3"}
                      onClick={() => void m?.flush()}
                    >
                      Retry save
                    </button>
                  )}
                </section>
                {comparison && (
                  <section
                    className={panel + " mb-5 border-amber-400"}
                    aria-label="Conflict comparison"
                  >
                    <h2 className="text-xl font-bold">
                      Compare with the latest saved copy
                    </h2>
                    <p className="my-3">
                      Your local edits are still here. Choose how to continue;
                      no overwrite has been sent.
                    </p>
                    <div className="space-y-3">
                      {definitions
                        .filter(
                          ([k]) => m?.fields[k] !== comparison.draft?.fields[k],
                        )
                        .map(([k, title]) => (
                          <div
                            key={k}
                            className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2"
                          >
                            <div>
                              <strong>{title} · Your edits</strong>
                              <p className="whitespace-pre-wrap break-words">
                                {m?.fields[k]}
                              </p>
                            </div>
                            <div>
                              <strong>Latest saved copy</strong>
                              <p className="whitespace-pre-wrap break-words">
                                {comparison.draft?.fields[k]}
                              </p>
                            </div>
                          </div>
                        ))}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        className={secondary}
                        onClick={() => {
                          install(comparison, selected);
                          setMessage("Latest saved copy loaded.");
                        }}
                      >
                        Reload server copy
                      </button>
                      {comparison.draft &&
                        ["draft", "returned"].includes(comparison.state) && (
                          <button
                            className={button}
                            onClick={() => {
                              const edits = { ...m!.fields };
                              install(comparison, selected);
                              model.current!.replace(edits);
                              timer.current = setTimeout(
                                () => void model.current?.flush(),
                                1000,
                              );
                              setChecked(false);
                              setMessage(
                                "Your edits are ready to save against the compared version.",
                              );
                            }}
                          >
                            Use my entire draft on latest version
                          </button>
                        )}
                    </div>
                  </section>
                )}
                <section
                  className={panel + " space-y-6"}
                  aria-label="SOAP note"
                >
                  {definitions.map(([key, title, help]) => (
                    <div key={key}>
                      <label
                        htmlFor={"note-" + key}
                        className="text-lg font-bold"
                      >
                        {title}
                      </label>
                      <p
                        id={"help-" + key}
                        className="mb-2 mt-1 text-sm text-slate-600"
                      >
                        {help}
                      </p>
                      <textarea
                        id={"note-" + key}
                        aria-describedby={"help-" + key}
                        value={fields[key] || ""}
                        onChange={(e) => edit(key, e.target.value)}
                        readOnly={!editable || status === "conflict"}
                        rows={4}
                        className="block w-full resize-y rounded-lg border border-slate-300 p-3 focus:border-emerald-600 focus:outline-emerald-600 read-only:bg-slate-50"
                      />
                      <p className="mt-1 text-right text-xs text-slate-500">
                        {Array.from(fields[key] || "").length} / 10,000
                        characters
                      </p>
                    </div>
                  ))}
                </section>
                {m && !historical && (
                  <section className={panel + " mt-5"}>
                    <h2 className="text-xl font-bold">
                      Check source and submit
                    </h2>
                    <p className="my-3">
                      Compare this saved version with the source above. Changes
                      require a new source check.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <button
                        className={secondary}
                        disabled={
                          busy ||
                          status !== "saved" ||
                          !!context?.known_source_gap ||
                          !!actionPending
                        }
                        onClick={() => void act("check_source")}
                      >
                        {checked
                          ? "Source checked"
                          : "I checked this saved note against the source"}
                      </button>
                      <button
                        className={button}
                        disabled={
                          busy ||
                          status !== "saved" ||
                          filled !== 7 ||
                          !checked ||
                          !!context?.known_source_gap ||
                          !!actionPending
                        }
                        onClick={() => void act("submit_note")}
                      >
                        Submit for review
                      </button>
                    </div>
                    {actionPending && !busy && (
                      <div className="mt-4">
                        <p className="mb-3">
                          The last action may have reached the server. Check its
                          state or retry the same request.
                        </p>
                        <button
                          className={secondary}
                          onClick={() =>
                            void act(
                              actionPending as "check_source" | "submit_note",
                            )
                          }
                        >
                          Retry last action
                        </button>
                        <button
                          className={secondary + " ml-3"}
                          onClick={() => void reload()}
                        >
                          Check latest server state
                        </button>
                      </div>
                    )}
                  </section>
                )}
                {!m && (
                  <p className={panel + " mt-5"}>
                    This submitted revision is read-only.
                  </p>
                )}
                <ReviewActions
                  note={note}
                  viewing={viewingRevision}
                  busy={busy}
                  pending={!!actionPending}
                  onDirty={setReviewDirty}
                  act={act}
                  activeCorrection={
                    selected.notes.find(
                      (n) =>
                        n.parent_id === note.note_id && n.state !== "reviewed",
                    )?.note_id
                  }
                  onOpen={(id) => navigate(() => void open(selected, id))}
                />
                {actionPending && !busy && !m && (
                  <section className={panel + " mt-5"}>
                    <p className="mb-3">
                      The last action may have reached the server. Retry the
                      same request or check its latest state.
                    </p>
                    <button
                      className={secondary}
                      onClick={() => void act(actionPending as ActionKind)}
                    >
                      Retry last action
                    </button>
                    <button
                      className={secondary + " ml-3"}
                      onClick={() => void reload()}
                    >
                      Check latest server state
                    </button>
                  </section>
                )}
                {!!note.reviews.length && (
                  <section
                    className={panel + " mt-5"}
                    aria-label="Reviewer feedback"
                  >
                    <h2 className="text-xl font-bold">Reviewer feedback</h2>
                    {note.reviews.map((r) => (
                      <div
                        key={r.revision}
                        className="mt-3 rounded-lg bg-slate-50 p-3"
                      >
                        <p className="font-semibold">
                          Revision {r.revision} ·{" "}
                          {r.action === "return"
                            ? "Returned"
                            : "Reviewed in pilot"}
                        </p>
                        {r.reason && (
                          <p className="mt-2 whitespace-pre-wrap break-words">
                            {r.reason}
                          </p>
                        )}
                      </div>
                    ))}
                  </section>
                )}
                {!!note.revisions.length && (
                  <RevisionPreview
                    key={note.note_id}
                    note={note}
                    revision={
                      historical?.number || note.revisions.slice(-1)[0].number
                    }
                    onError={handleError}
                  />
                )}
                {!!note.revisions.length && (
                  <section
                    className={panel + " mt-5"}
                    aria-label="Submission history"
                  >
                    <h2 className="text-xl font-bold">Submission history</h2>
                    {note.revisions.map((r) => (
                      <div
                        className="mt-3 flex flex-wrap items-center gap-3"
                        key={r.number}
                      >
                        <p>
                          Revision {r.number} ·{" "}
                          {new Date(r.submitted_at).toLocaleString()} ·
                          Immutable snapshot
                        </p>
                        <button
                          className={secondary}
                          disabled={busy}
                          onClick={() => setViewingRevision(r.number)}
                        >
                          View revision {r.number}
                        </button>
                      </div>
                    ))}
                    {historical && (
                      <button
                        className={secondary + " mt-3"}
                        onClick={() => setViewingRevision(null)}
                      >
                        {m ? "Return to working draft" : "Show latest revision"}
                      </button>
                    )}
                  </section>
                )}
                {selected.notes.length > 1 && (
                  <section
                    className={panel + " mt-5"}
                    aria-label="Related notes"
                  >
                    <h2 className="text-xl font-bold">
                      Original and linked corrections
                    </h2>
                    {selected.notes.map((n) => (
                      <div
                        className="mt-3 flex flex-wrap items-center gap-3"
                        key={n.note_id}
                      >
                        <span>
                          {n.parent_id ? "Linked correction" : "Original note"}{" "}
                          · {stateLabel(n.state)}
                        </span>
                        <button
                          className={secondary}
                          disabled={busy || n.note_id === note.note_id}
                          onClick={() =>
                            navigate(() => void open(selected, n.note_id))
                          }
                        >
                          {n.parent_id
                            ? "Open linked correction"
                            : "Open original note"}
                        </button>
                      </div>
                    ))}
                  </section>
                )}
              </>
            )}
          </>
        )}
      </main>
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-title"
            className={panel + " w-full max-w-lg"}
          >
            <h2 id="leave-title" className="text-xl font-bold">
              Unsaved work
            </h2>
            <p className="my-4">
              Save before leaving, stay here, or discard local unsaved edits. A
              request already sent may have committed. Unsent review or
              correction reasons are discarded if you leave; send them with the
              appropriate workflow action. Forced browser closure can lose
              edits.
            </p>
            <div className="flex flex-col gap-3">
              <button className={secondary} onClick={() => setPending(null)}>
                Stay here
              </button>
              <button
                className={button}
                disabled={
                  busy ||
                  status === "conflict" ||
                  !!actionPending ||
                  !model.current
                }
                onClick={async () => {
                  setBusy(true);
                  const g = generation.current;
                  await model.current?.flush();
                  if (g === generation.current) {
                    setBusy(false);
                    if (model.current?.status === "saved") {
                      const fn = pending;
                      setPending(null);
                      fn();
                    }
                  }
                }}
              >
                Save and continue
              </button>
              <button
                className={secondary}
                disabled={status === "saving" || busy}
                onClick={() => {
                  model.current?.close();
                  model.current = null;
                  actionJob.current = null;
                  setReviewDirty(false);
                  setActionPending(null);
                  const fn = pending;
                  setPending(null);
                  fn();
                }}
              >
                Discard local changes and continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
