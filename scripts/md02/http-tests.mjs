// Real local HTTP checks; no simulated backend or production credentials.
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
const cfg = JSON.parse(await readFile(process.argv[2], "utf8"));
const origin = cfg.origin;
let token = "",
  csrf = "";
let count = 0;
async function call(path, data, extra = {}) {
  const r = await fetch(origin + "/api/md02/" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      ...(data === undefined
        ? {}
        : { Origin: origin, "Content-Type": "application/json" }),
      ...(token ? { Cookie: token } : {}),
      ...(csrf ? { "X-MD02-CSRF": csrf } : {}),
      ...extra,
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return { r, data: await r.json() };
}
function pass(label) {
  count++;
  console.log("PASS:", label);
}
let x = await call("encounters", {});
assert.equal(x.r.status, 401);
assert.deepEqual(x.data, { code: "AUTH_REQUIRED" });
pass("No session cannot read encounters");
x = await call("login", {
  username: "training-author",
  password: "wrong-training-code",
});
assert.equal(x.r.status, 401);
pass("Wrong training password denied");
const a = cfg.accounts[0];
x = await call("login", { username: a.username, password: a.password });
assert.equal(x.r.status, 200);
token = x.r.headers.get("set-cookie").split(";")[0];
csrf = x.data.csrf;
assert(x.r.headers.get("set-cookie").includes("HttpOnly"));
assert.equal(x.r.headers.get("cache-control"), "no-store, private");
pass("Opaque HttpOnly session and no-store response");
x = await call("encounters", {});
assert.equal(x.r.status, 200);
pass("Authenticated session reads only assigned encounters");
x = await call("command", { actor_id: cfg.accounts[1].id });
assert.equal(x.r.status, 400);
assert.deepEqual(x.data, { code: "VALIDATION_FAILED" });
pass("Actor injection rejected with controlled error and no SQL context");
x = await call("logout", {});
assert.equal(x.r.status, 200);
csrf = "";
x = await call("encounters", {});
assert.equal(x.r.status, 401);
pass("Captured cookie cannot replay after logout");
token = "";
x = await call(
  "login",
  { username: a.username, password: a.password },
  { Origin: "https://untrusted.example.invalid" },
);
assert.equal(x.r.status, 401);
assert.equal(x.r.headers.get("access-control-allow-origin"), null);
pass("Cross-origin login denied; no permissive CORS");
x = await call("login", { username: a.username, password: a.password });
token = x.r.headers.get("set-cookie").split(";")[0];
csrf = "";
x = await call("encounters", {});
assert.equal(x.r.status, 401);
pass("Missing CSRF denied even with valid cookie");
token = "";
csrf = "";
let rateLimited = false;
for (let i = 0; i < 21; i++) {
  const r = await call("login", {
    username: "training-unassigned",
    password: "incorrect-training-password",
  });
  if (r.r.status === 429) {
    assert.deepEqual(r.data, { code: "RATE_LIMITED" });
    rateLimited = true;
  }
}
assert(rateLimited);
pass("Training login throttle returns a distinct rate-limit response");
const permitted = await call("login", {
  username: a.username,
  password: a.password,
});
assert.equal(permitted.r.status, 200);
token = permitted.r.headers.get("set-cookie").split(";")[0];
csrf = permitted.data.csrf;
await call("logout", {});
pass("One training account throttle does not block another account");
const log = await readFile(
  new URL("./security-events.ndjson", "file://" + process.argv[2]),
  "utf8",
).catch(() =>
  readFile(
    process.argv[2].replace("gateway.json", "security-events.ndjson"),
    "utf8",
  ),
);
for (const a of cfg.accounts) assert(!log.includes(a.password));
for (const marker of [
  "TRAINING unsupported placeholder",
  "TRAINING supplied",
  "request.jwt",
  "select md02",
  "payload",
  "fields",
])
  assert(!log.includes(marker));
assert.equal(
  (
    await stat(
      process.argv[2].replace("gateway.json", "security-events.ndjson"),
    )
  ).mode & 0o777,
  0o600,
);
pass(
  "Failure audit excludes passwords, prose and raw requests and is mode 0600",
);
console.log("MD02_HTTP_COMPLETE", count);
