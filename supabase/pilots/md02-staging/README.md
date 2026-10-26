# MD02 isolated hosted staging

This optional pilot connects the existing fictional SOAP workflow to real Supabase Auth and caller-scoped database commands. It targets only the approved existing staging project `bgvhqsfpjanmqixtmdtl`. Production, real service records and PHI use are outside this pilot.

## Boundaries

- These migrations are outside `supabase/migrations`; normal production migration discovery excludes them. They are additive and never reset existing fleet fixtures.
- The first SQL guard requires the known fictional staging owner and an absent MD02 schema. Apply through an explicitly selected staging management project. Never weaken the guard for production.
- Seven `@example.invalid` actors have separate explicit care memberships. Fleet roles do not imply care access. Observer starts disabled; the inactive test actor is banned after validation.
- `md02-api` validates the bearer token using Auth `getUser` on every request. Its user-scoped client invokes a SECURITY INVOKER RPC. Private guards also require a live Auth session and unbanned user before evaluating current scoped membership and assignments.
- `verify_jwt:false` for this Edge function is intentional because the handler performs real Auth validation itself. No privileged key is used by care requests.
- Bootstrap is a short-lived, fixed-seven-user management action with a one-time token hash and expiry. Substitute placeholders only in private temporary files. After use, replace its deployment with HTTP 410. The completed staging deployment is already inert.

## Local browser adapter

Run `npm ci --ignore-scripts`, then `npm run build:md02:staging`. This produces `dist-md02-staging/md02-staging.html`. Normal and MD01 outputs exclude this entry.

The BFF is `node scripts/md02-staging/server.mjs /absolute/private/config.json`. Its config directory must be mode 0700 and the file mode 0600, owned by the current user. Required fields: `project`, `url`, `key` (publishable key), `scope`, `httpPort`, `origin`, and `accounts` containing username, synthetic email, actual Auth UUID and display label. Account passwords must not be put in this config. They are supplied at sign-in. The approved scope is `90000000-0000-0000-0000-000000000001`; ports are frontend 5215 and BFF 5216, bound to loopback.

For development use `npm run dev:md02:staging`, then open `http://127.0.0.1:5215/md02-staging.html`. Compiled review requires a local static server for the built entry/assets and same-origin `/api/md02` proxy to 5216. Public exposure requires separate approval and a protected adapter; none is part of this source package.

Actual Auth access/refresh tokens stay in BFF memory. The browser receives only an opaque HttpOnly SameSite Strict cookie and CSRF token. Requests validate exact origin/host. Sessions last at most 20 minutes or provider JWT expiry, whichever comes first, and require sign-in again; there is no silent refresh. Restarting this single-process Mac BFF signs users out. It is not an approved production hosting design.

## Verification

- `node tests/md02-staging-config.test.mjs`: wrong project, non-loopback origin and unapproved scope fail closed.
- `node scripts/verify-md02-staging-build.mjs`: entry isolation and browser-secret checks after normal, MD01 and staging builds.
- `tests/hosted.mjs`: real Auth/API workflow and adversarial checks in separately seeded synthetic test scopes. Read its private runtime contract before running; never point it at production.
- `tests/revocation.mjs`: care-membership and Observer changes in synthetic scopes; restore temporary toggles afterward.
- `tests/bff.mjs`: real Auth through loopback cookie/CSRF adapter. Its fresh-owner-scope assertion expects no notes, so run before browser drafting. It does not reset data.

The original hosted test run passed its first 32 checks, then exposed an incorrect test expectation: BETA source checking correctly rejects known missing facts before submission. The expectation was corrected and the remaining five checks ran against that retained state. Evidence records this two-segment run; it is not represented as one uninterrupted rerun.

Recovery evidence restores an actual hosted fictional care snapshot into a new socket-only local PostgreSQL database and checks all 13 table digests, RLS and access guards. The local Auth shim cannot prove full Supabase project/Auth/Storage disaster recovery. Production recovery and PHI readiness remain separate acceptance gates.

Never commit credentials, private runtime configs, generated bootstrap hashes, raw Auth tokens or internal institutional reports. Keep owner review and merge approval distinct from automated verification.
