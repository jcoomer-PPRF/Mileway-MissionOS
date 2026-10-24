# MD01 dependency remediation

Publication is held at Jeff Coomer's direction. This change addresses the 14
reported dependency findings before another release decision. It does not
activate Notes or care storage, change the backend, or authorize deployment.

## Changes

- Use patched Vite 7 and its compatible React plugin, retaining the existing
  Rollup build configuration rather than introducing Vite 8's Rolldown migration.
  Set the previous Vite 5 JavaScript transpilation targets explicitly; this is not
  a claim that every older physical browser has passed acceptance.
- Upgrade React Router to patched 7.18.4; retain the declarative routes and guards.
- Use the official SheetJS 0.20.3 tarball with vendored bytes and lockfile integrity.
  See `vendor/README.md` for provenance. Excel export remains the same public API.
- Remove unused Zod, resolver and React Hook Form dependencies. The current source
  imports none of them; there is no form-validation migration or behavior change.
- Refresh compatible PostCSS, Browserslist, source-map, Nano ID and baseline-data
  packages. Override `postcss-selector-parser` to patched 7.1.6 or newer for both
  Tailwind 3 and its nesting dependency. Parser 7 changes insertion behavior during
  iteration; builds, CSS output, desktop/mobile views and workflow regressions
  validate its use here. Retain Tailwind 3's existing visual system.
- Run `npm run audit:dependencies` in CI after the locked, script-free install.
  Known findings at any severity fail this gate; no audit allowlist is used.

## Required verification

Run a clean `npm ci --ignore-scripts`, the dependency audit, TypeScript, unit checks,
both build modes, the isolation script and both existing browser suites. Exercise
the compiled production artifact with fictional intercepted backend responses.
The Excel regression checks all four worksheets, 1,207 paginated trip rows,
numeric cell types and formula-like text retained as text. Inspect an exported
workbook using an independent OOXML reader as well.

Passing checks demonstrate the tested behavior and absence of advisories reported
by npm at that time. They do not prove the absence of every bug or unknown
vulnerability. Keep the previous production deployment and all earlier evidence.
The older `Production_Candidate_v1` package remains historical and is not approved
for publication. Any replacement candidate needs its own source identity, test
results, hashes, and owner approval before publishing.

## Upstream references

- Vite 7 migration: https://v7.vite.dev/guide/migration
- React Router advisory: https://github.com/remix-run/react-router/security/advisories/GHSA-wrjc-x8rr-h8h6
- SheetJS installation: https://docs.sheetjs.com/docs/getting-started/installation/nodejs/
- Selector parser changelog: https://github.com/postcss/postcss-selector-parser/blob/main/CHANGELOG.md
