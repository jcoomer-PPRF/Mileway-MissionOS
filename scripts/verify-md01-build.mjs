import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';

async function javascript(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = `${directory}/${entry.name}`;
      return entry.isDirectory()
        ? javascript(path)
        : entry.name.endsWith('.js')
          ? readFile(path, 'utf8')
          : '';
    }),
  );
  return files.join('\n');
}

const preview = await javascript('dist-md01');
const application = await javascript('dist');
const html = await readFile('dist-md01/demo.html', 'utf8');
assert.ok(
  html.includes("connect-src 'none'"),
  'Compiled preview must disable outbound connections',
);
assert.ok(preview.includes('TEST PERSON ALPHA'), 'Expected fictional fixture in preview');
for (const value of [
  'supabase.co',
  '/auth/v1/',
  '/rest/v1/',
  '/storage/v1/',
  'VITE_SUPABASE_ANON_KEY',
  'browser-test-public-key',
]) {
  assert.ok(
    !preview.includes(value),
    `Preview unexpectedly includes backend code/config: ${value}`,
  );
}
assert.ok(
  !application.includes('TEST PERSON ALPHA'),
  'Fictional adapter must be excluded from normal build',
);
let hasDemo = true;
try {
  await access('dist/demo.html');
} catch {
  hasDemo = false;
}
assert.equal(hasDemo, false, 'Default application build must exclude demo.html');
console.log('MD01 build isolation passed: disconnected preview; no demo adapter in normal build.');
