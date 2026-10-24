# MD01 — Mission Delivery build review

Prepared 2026-10-24 UTC. Owner: Jeff Coomer. State: implementation for review,
with fictional data only. This is a new proposed interface, not recovered UI.

## Assignment and source authority

Jeff authorized the MD01 build after reviewing the local Codex recovery addendum.
The objective is a concrete staff workflow to review before persistent care work:
Mission Delivery first, supplemental Operations, and a typed SOAP demonstration.
The starting point is deployed main `d35ca6963a094dbaea9436a96c6005f6ea8e8619`,
independently confirmed with `git ls-remote` before this worktree was created.
Existing cloud/release and Mac checkouts are preserved.

Inputs, in order: Jeff's current direction; the MissionOS Constitution and founding
design/AI principles; the existing progress-note skill; the local recovery review;
and the deployed fleet source. Documentation policy PPR-CONF-003 remains a draft;
this preview does not ratify its proposed review/signature lifecycle.

- [Local Codex recovery addendum](https://docs.google.com/document/d/1xc80JirfnYjsaXzaZ39ERMYOoBsz_4p6/edit)
- [Original scope reconciliation](https://drive.google.com/file/d/1DnGSxq0giQSIgmdDEao9c06UZZ4br7yd/view)
- [MissionOS source domain](https://drive.google.com/drive/folders/1yUbSazX1FGftBqnIssBIQGAoBKvuk8f6)

The six historical source files remain unreadable according to the local audit.
They are not included or represented as recovered designs. That unresolved
historical recovery does not prevent this authorized, reversible demonstration.

This is an internal operational build, for Jeff's product review. Allowed:
isolated code, tests, review artifacts and a draft PR. Excluded: merges,
deployment, care schema/storage, access changes, purchases, provider configuration
and real service records. PPRF/PPRS attribution is not decided by a fictional
fixture. OneStep continues as the current record of care.

## What changed

- A shared MissionOS shell groups Mission Delivery, Operations and shared tools.
  The authenticated `/` landing is now My Day. The fleet dashboard moves to
  `/operations`, with `/dashboard` as an alias. All other deep links and the
  existing Auth/role guards remain. Login branding, browser metadata and fleet
  export filenames use MissionOS. Historical SQL/scratch database names remain.
- A **separate entry** at `/demo.html` runs without a sign-in or backend keys.
  Its import graph excludes the operational Auth provider and Supabase client.
  The ordinary application build excludes the demo entry and fictional adapter.
  The compiled review build sets `connect-src 'none'` as an additional boundary.
- My Day and Notes lead to TEST PERSON ALPHA / TEST ENCOUNTER 001 (complete
  scripted source) and TEST PERSON BETA / TEST ENCOUNTER 002 (incomplete source).
  A visible banner identifies the artificial data and in-memory behavior.
- The versioned template presents S/O/A/P plus intervention, person's response
  and goal connection. The source stays visible. **Use supplied sample** copies
  only explicit scripted facts; it is not AI drafting. Missing fields remain
  empty. Duration, clinical findings and billing eligibility are not inferred.
- Staff edits, checks the source and submits for simulated review. Reviewers can
  return with comments or accept in the demo. Editing invalidates the source
  check; submission and acceptance lock editing as appropriate. Transition
  history and submission revision numbers are visible. Nothing creates a legal
  signature, final/sealed record, billing output or durable care audit.
- Preview and download contain the current draft, template version, revision and
  simulated activity, conspicuously marked **NOT A SERVICE RECORD. NOT SIGNED**.
  A download is a user-created local text file; resetting the page does not erase
  an already downloaded file.
- In the standalone preview, Operations explains the separation and links to the
  current signed-in application in a new tab. It does not pretend to load fleet
  data or call a backend. Actual fleet pages are exercised in the normal app.

## Run and review locally

Requires Node 24+. In the isolated branch/checkout:

```sh
npm ci --ignore-scripts
npm run dev:md01
```

Open `http://localhost:5173/demo.html`. No `.env` or account is required for this
entry. For the compiled version:

```sh
npm run build:md01
npm run preview:md01
```

Open `http://localhost:4173/demo.html` (Vite prints the selected port). Serve the
compiled output over local HTTP; do not double-click the HTML with a file URL.
The review ZIP is the compiled `dist-md01` directory, not a production release.
Never upload it over the live application.

Suggested walkthrough:

1. Open ALPHA. Use the supplied sample or type from the visible scripted source.
   Edit a field, check it against the source and submit for simulated review.
2. Select the **Reviewer** demo role. Open Review Queue. Return the note with a
   specific comment. Blank return comments are rejected.
3. Select **Staff**, revise the returned draft, check the source again and
   resubmit. Select Reviewer and accept in the demo. Inspect the history and
   download the clearly marked preview.
4. Open BETA and use its supplied sample. Unsupported fields stay blank and
   submission remains blocked even if the source-check box is selected.
5. Try Observer, reset/cancel-reset, mobile navigation and a page reload.

## Demo permissions and lifetime

| Demo role | Read/preview | Edit draft or returned note | Submit | Return/accept submitted note |
|---|---|---|---|---|
| Staff | Yes | Yes | With seven fields and current source check | No |
| Reviewer | Yes | No | No | Yes; return requires comment |
| Observer | Yes | No | No | No |

These are fictional workflow roles, **not** new database roles or a care access
policy. The reducer enforces transitions as well as the controls. Fleet roles
and authorization are unchanged. Nothing in the demo uses real account identity.

The adapter is synchronous React memory only: no fetch, SDK, browser storage,
service worker, telemetry or provider calls. Routing inside the preview retains
state; reload, leaving/reopening or a confirmed reset starts blank. Canceling
reset retains the current draft. A reset clears all drafts, history and demo role.
Do not enter actual service information. One current submitted snapshot is held
in memory; this is not a persistent note-version or amendment system.

## Verification

The build review evidence records:

- TypeScript checks and both Vite build modes.
- Existing 10 integrity/unit checks plus five focused workflow checks: source
  gaps, source-check invalidation, role/state matrix, return/resubmission snapshot
  behavior and complete reset.
- 19 development-browser scenarios: six documentation flows, four existing
  access/export regressions, and nine shell/deep-link/role/Auth checks. Real
  Chromium runs locally; the normal backend is mocked and never production.
- The same six documentation browser scenarios against the **compiled** preview.
  They include no backend traffic or browser-storage writes, missing-fact
  handling, edit/return/resubmit/export, reset/reload, read-only roles, escaped
  markup, mobile overflow checks and native-dialog keyboard/focus behavior.
- Compiled isolation inspection: no backend client/config in the preview;
  fictional adapter excluded from the normal output; restrictive preview CSP.
- Rendered screenshots at 1440 × 1000 and 390 × 844, visually inspected. These
  are emulated browser sizes, not a new physical-iPhone acceptance test.

Reproduce with:

```sh
npm run typecheck
npm test
npm run build
npm run build:md01
node scripts/verify-md01-build.mjs
npm run test:e2e
npm run test:md01:built
```

Install Playwright's browser if necessary. In this Linux environment the system
browser is selected using `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`.
The existing PostgreSQL 17 role/integrity/concurrency/upgrade and runner-guard
jobs remain in GitHub CI, alongside the added compiled-preview checks. No SQL,
Edge Function, database, bucket or provider changes are part of MD01. Local
browser checks do not substitute for hosted or real-data acceptance.

## Exit and next decisions

The branch and review packet are ready for product review after the recorded
checks pass; a draft PR is the review vehicle. The live app remains unchanged.
Any later release should recheck its actual hosting/backend state and include
an explicit rollout decision; this is not a deployment instruction.

Jeff can now assess the actual navigation, note fields and review behavior.
Before persistent care work, settle record ownership by service line, care
storage/assignment access, review/signature authority, retention and processors.
Before capture work, choose the phone/watch hardware and capture mode. Inventory
OneStep's blank templates and required outputs before claiming replacement
parity. No watch or provider decision was required to complete MD01.
