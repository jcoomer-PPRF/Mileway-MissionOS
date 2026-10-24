# SheetJS distribution provenance

`xlsx-0.20.3.tgz` is the unmodified SheetJS Community Edition package downloaded
from the project's official distribution endpoint:
https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz

Verified package metadata: `xlsx` version `0.20.3`.
SHA-256: `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`.

The upstream installation guide identifies the npm registry copy (0.18.5) as
outdated and recommends vendoring the official tarball:
https://docs.sheetjs.com/docs/getting-started/installation/nodejs/

`package.json` uses this local archive; `package-lock.json` pins its integrity.
`npm ci --ignore-scripts` verifies the locked archive without install hooks.
The tarball includes the upstream Apache-2.0 license. Preserve the license and
provenance when refreshing this package. Do not substitute an unreviewed fork or
revert to the obsolete registry version to make installation easier.
