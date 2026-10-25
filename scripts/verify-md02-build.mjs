import assert from "node:assert/strict";
import { readFile, readdir, access } from "node:fs/promises";
async function js(dir) {
  return (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map((e) =>
        e.isDirectory()
          ? js(dir + "/" + e.name)
          : e.name.endsWith(".js")
            ? readFile(dir + "/" + e.name, "utf8")
            : "",
      ),
    )
  ).join("\n");
}
const main = await js("dist"),
  md01 = await js("dist-md01"),
  md02 = await js("dist-md02");
for (const marker of [
  "/api/md02/",
  "Training username",
  "Compare with the latest saved copy",
]) {
  assert(!main.includes(marker));
  assert(!md01.includes(marker));
  assert(md02.includes(marker));
}
for (const file of ["md02.html", "demo.html"])
  await assert.rejects(access("dist/" + file));
for (const marker of [
  "supabase.co",
  "/auth/v1/",
  "/rest/v1/",
  "md02_gateway",
  "gateway.json",
])
  assert(!md02.includes(marker));
const html = await readFile("dist-md02/md02.html", "utf8");
assert(html.includes("Content-Security-Policy"));
assert(html.includes("connect-src"));
console.log(
  "MD02 build isolation passed: training transport excluded from normal and MD01 builds; no hosted credentials or gateway configuration in client.",
);
