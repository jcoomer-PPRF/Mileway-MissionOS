/** LOCAL FICTIONAL training gateway. No hosted Supabase credentials or API. */
import http from "node:http";
import { readFile, stat, appendFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
const configPath = resolve(process.argv[2] || "");
if (!/^\/private\/tmp\/missionos-md02-[\w-]+\/gateway.json$/.test(configPath))
  throw Error("LOCAL_CONFIG_REQUIRED");
const cfg = JSON.parse(await readFile(configPath, "utf8"));
const root = dirname(configPath);
for (const path of [root, cfg.socket]) {
  const s = await stat(path);
  if (
    !s.isDirectory() ||
    s.uid !== process.getuid() ||
    (s.mode & 0o777) !== 0o700
  )
    throw Error("PRIVATE_SOCKET_REQUIRED");
}
if (
  cfg.socket !== root + "/socket" ||
  !/^missionos_md02_[a-z0-9_]+_test$/.test(cfg.database) ||
  !/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(cfg.origin) ||
  !Number.isInteger(cfg.httpPort) || cfg.httpPort < 1024 || cfg.httpPort > 65535 ||
  Number(new URL(cfg.origin).port) < 1024 || Number(new URL(cfg.origin).port) > 65535 ||
  Number(new URL(cfg.origin).port) === cfg.httpPort
)
  throw Error("LOCAL_TARGET_REQUIRED");
const env = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith("PG")),
);
const scope = "10000000-0000-0000-0000-000000000001";
const quote = (v) =>
  v === null
    ? "null"
    : "'" +
      String(typeof v === "object" ? JSON.stringify(v) : v).replaceAll(
        "'",
        "''",
      ) +
      "'";
const known = [
  "AUTH_REQUIRED",
  "NOT_FOUND_OR_NOT_ALLOWED",
  "VERSION_CONFLICT",
  "INVALID_STATE",
  "VALIDATION_FAILED",
  "REQUEST_ID_REUSED",
];
async function sql(statement, actor) {
  return await new Promise((yes, no) => {
    const proc = spawn(
      cfg.psql,
      [
        "-X",
        "-qAt",
        "-v",
        "ON_ERROR_STOP=1",
        "-h",
        cfg.socket,
        "-p",
        String(cfg.port),
        "-U",
        "md02_gateway",
        "-d",
        cfg.database,
      ],
      { env },
    );
    let out = "",
      err = "";
    const timeout = setTimeout(() => proc.kill(), 10000);
    proc.stdout.on("data", (b) => {
      out += b;
      if (out.length > 2000000) proc.kill();
    });
    proc.stderr.on("data", (b) => {
      if (err.length < 4000) err += b;
    });
    proc.on("error", () => {
      clearTimeout(timeout);
      no(Error("TRANSIENT_FAILURE"));
    });
    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (code) {
        no(
          Error(
            known.find((x) => err.includes("ERROR:  " + x)) ||
              "TRANSIENT_FAILURE",
          ),
        );
        return;
      }
      try {
        yes(JSON.parse(out.trim()));
      } catch {
        no(Error("TRANSIENT_FAILURE"));
      }
    });
    proc.stdin.on("error", () => {});
    proc.stdin.end(
      actor
        ? `begin; set local role authenticated; set local request.jwt.claim.sub=${quote(actor)}; ${statement}; commit;`
        : statement,
    );
  });
}
const identity = await sql(
  "select json_build_object('database',current_database(),'local',inet_server_addr() is null,'marker',current_setting('missionos.md02_disposable',true),'superuser',(select rolsuper from pg_roles where rolname=current_user),'c_migration',exists(select from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='md02' and p.proname='revision_output'))",
);
if (
  identity.database !== cfg.database ||
  !identity.local ||
  identity.marker !== "fictional-training-only" ||
  identity.superuser
)
  throw Error("UNSAFE_DATABASE");
if (!identity.c_migration) throw Error("LOCAL_C_MIGRATION_REQUIRED");
const allowedIds = [101, 102, 108, 105].map(
  (i) => "00000000-0000-0000-0000-" + String(i).padStart(12, "0"),
);
const accounts = cfg.accounts.map((a) => {
  if (!allowedIds.includes(a.id)) throw Error("UNKNOWN_TRAINING_ACCOUNT");
  const salt = randomBytes(16);
  return {
    ...a,
    password: undefined,
    salt,
    hash: scryptSync(a.password, salt, 32),
  };
});
// Clear plaintext startup passwords from the in-memory parsed config.
for (const a of cfg.accounts) a.password = undefined;
const sessions = new Map();
const attempts = new Map();
const ttl = 20 * 60 * 1000;
function session(req) {
  const token = req.headers.cookie
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("md02_session="))
    ?.slice(13);
  const s = token && sessions.get(token);
  if (!s) return null;
  if (s.expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { ...s, token };
}
function send(res, status, data, cookie) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store, private",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...(cookie ? { "Set-Cookie": cookie } : {}),
  });
  res.end(JSON.stringify(data));
}
const cookie = (token) =>
  `md02_session=${token}; HttpOnly; SameSite=Strict; Path=/api/md02; Max-Age=${token ? 1200 : 0}`;
async function body(req) {
  if (req.headers["content-type"] !== "application/json")
    throw Error("VALIDATION_FAILED");
  let bytes = 0;
  const chunks = [];
  for await (const c of req) {
    bytes += c.length;
    if (bytes > 524288) throw Error("VALIDATION_FAILED");
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks));
  } catch {
    throw Error("VALIDATION_FAILED");
  }
}
const uuid = (x) =>
  typeof x === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
const keys = (o, k) =>
  o &&
  typeof o === "object" &&
  !Array.isArray(o) &&
  Object.keys(o).every((x) => k.includes(x));
const audit = (code, actor) =>
  appendFile(
    root + "/security-events.ndjson",
    JSON.stringify({
      at: new Date().toISOString(),
      code,
      actor: actor || null,
    }) + "\n",
    { mode: 0o600 },
  );
const server = http.createServer(async (req, res) => {
  let current;
  try {
    if (
      ![new URL(cfg.origin).host, `127.0.0.1:${cfg.httpPort}`].includes(
        req.headers.host,
      ) ||
      !["127.0.0.1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress)
    )
      throw Error("NOT_FOUND_OR_NOT_ALLOWED");
    if (req.method === "GET" && req.url === "/api/md02/session") {
      current = session(req);
      if (!current) {
        send(res, 200, { user: null });
        return;
      }
      // Check current DB authority on every session poll, independently of cookie age.
      await sql(
        `select md02.list_encounters(${quote(scope)})`,
        current.user.id,
      );
      send(res, 200, {
        user: current.user,
        csrf: current.csrf,
        expires: current.expires,
      });
      return;
    }
    if (req.method !== "POST" || req.headers.origin !== cfg.origin)
      throw Error("NOT_FOUND_OR_NOT_ALLOWED");
    const b = await body(req);
    if (req.url === "/api/md02/login") {
      if (
        !keys(b, ["username", "password"]) ||
        typeof b.username !== "string" ||
        typeof b.password !== "string" ||
        b.password.length > 200
      )
        throw Error("VALIDATION_FAILED");
      const attemptKey = accounts.some((a) => a.username === b.username)
        ? b.username
        : "unknown";
      const limit = attempts.get(attemptKey) || {
        count: 0,
        until: Date.now() + 60000,
      };
      if (limit.until < Date.now()) {
        limit.count = 0;
        limit.until = Date.now() + 60000;
      }
      limit.count++;
      attempts.set(attemptKey, limit);
      if (limit.count > 20) throw Error("RATE_LIMITED");
      const a = accounts.find((a) => a.username === b.username);
      const salt = a?.salt || Buffer.alloc(16);
      const check = scryptSync(b.password, salt, 32);
      if (!a || !timingSafeEqual(check, a.hash)) throw Error("AUTH_REQUIRED");
      await sql(`select md02.list_encounters(${quote(scope)})`, a.id);
      const old = session(req);
      if (old) sessions.delete(old.token);
      const token = randomBytes(32).toString("base64url");
      const s = {
        user: { id: a.id, label: a.label, username: a.username },
        csrf: randomBytes(32).toString("base64url"),
        expires: Date.now() + ttl,
      };
      sessions.set(token, s);
      send(
        res,
        200,
        { user: s.user, csrf: s.csrf, expires: s.expires },
        cookie(token),
      );
      return;
    }
    current = session(req);
    if (!current) throw Error("AUTH_REQUIRED");
    if (req.headers["x-md02-csrf"] !== current.csrf)
      throw Error("NOT_FOUND_OR_NOT_ALLOWED");
    if (req.url === "/api/md02/logout") {
      sessions.delete(current.token);
      send(res, 200, { ok: true }, cookie(""));
      return;
    }
    if (req.url === "/api/md02/encounters") {
      if (!keys(b, []) || Object.keys(b).length)
        throw Error("VALIDATION_FAILED");
      send(
        res,
        200,
        await sql(
          `select md02.list_encounters(${quote(scope)})`,
          current.user.id,
        ),
      );
      return;
    }
    if (req.url === "/api/md02/note") {
      if (!keys(b, ["note_id"]) || !uuid(b.note_id))
        throw Error("VALIDATION_FAILED");
      send(
        res,
        200,
        await sql(
          `select md02.read_note(${quote(scope)},${quote(b.note_id)})`,
          current.user.id,
        ),
      );
      return;
    }
    if (req.url === "/api/md02/output") {
      if (
        !keys(b, ["note_id", "revision", "mode"]) ||
        !uuid(b.note_id) ||
        !Number.isSafeInteger(b.revision) ||
        b.revision < 1 ||
        !["preview", "export"].includes(b.mode)
      )
        throw Error("VALIDATION_FAILED");
      send(
        res,
        200,
        await sql(
          "select md02.revision_output(" +
            [scope, b.note_id, b.revision, b.mode].map(quote).join(",") +
            ")",
          current.user.id,
        ),
      );
      return;
    }
    if (req.url === "/api/md02/command") {
      if (
        !keys(b, [
          "encounter_id",
          "note_id",
          "request_id",
          "row_version",
          "assignment_version",
          "membership_version",
          "command",
          "payload",
        ]) ||
        !uuid(b.encounter_id) ||
        !(b.note_id === null || uuid(b.note_id)) ||
        !uuid(b.request_id) ||
        ![
          "create_note",
          "save_draft",
          "check_source",
          "submit_note",
          "return_note",
          "accept_note",
          "start_correction",
        ].includes(b.command) ||
        !["row_version", "assignment_version", "membership_version"].every(
          (k) => Number.isSafeInteger(b[k]) && b[k] >= 0,
        ) ||
        !keys(b.payload, Object.keys(b.payload || {}))
      )
        throw Error("VALIDATION_FAILED");
      const args = [
        scope,
        b.encounter_id,
        b.note_id,
        b.request_id,
        b.row_version,
        b.assignment_version,
        b.membership_version,
        b.command,
        b.payload,
      ];
      send(
        res,
        200,
        await sql(
          "select md02.command(" + args.map(quote).join(",") + ")",
          current.user.id,
        ),
      );
      return;
    }
    throw Error("NOT_FOUND_OR_NOT_ALLOWED");
  } catch (e) {
    const code = [...known, "TRANSIENT_FAILURE", "RATE_LIMITED"].includes(
      e.message,
    )
      ? e.message
      : "TRANSIENT_FAILURE";
    await audit(code, current?.user.id).catch(() => {});
    const auth =
      code === "AUTH_REQUIRED" || code === "NOT_FOUND_OR_NOT_ALLOWED";
    if (auth && current) sessions.delete(current.token);
    send(
      res,
      code === "RATE_LIMITED"
        ? 429
        : auth
          ? 401
          : code === "VERSION_CONFLICT" ||
              code === "INVALID_STATE" ||
              code === "REQUEST_ID_REUSED"
            ? 409
            : code === "TRANSIENT_FAILURE"
              ? 503
              : 400,
      { code },
      auth ? cookie("") : undefined,
    );
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(cfg.httpPort, "127.0.0.1", () =>
  console.log(
    "MD02 local training gateway ready on loopback. No request bodies are logged.",
  ),
);
const cleanup = setInterval(() => {
  for (const [t, s] of sessions) if (s.expires < Date.now()) sessions.delete(t);
}, 60000);
cleanup.unref();
process.on("SIGTERM", () => {
  server.close();
  clearInterval(cleanup);
});
