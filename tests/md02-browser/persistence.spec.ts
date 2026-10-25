import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";
const cfg = JSON.parse(readFileSync(process.env.MD02_GATEWAY_CONFIG!, "utf8"));
const origin = cfg.origin;
const defs = [
  "S · Subjective",
  "O · Objective",
  "A · Peer-support reflection",
  "P · Plan",
  "Peer intervention",
  "Person’s response",
  "Connection to the person’s goal",
];
const blank = Object.fromEntries(
  [
    "subjective",
    "objective",
    "assessment",
    "plan",
    "intervention",
    "response",
    "goal_connection",
  ].map((k) => [k, ""]),
);
async function signin(page: Page, username = "training-author") {
  const a = cfg.accounts.find((x: any) => x.username === username);
  await page.goto("/md02.html");
  await page.getByLabel("Training username").fill(a.username);
  await page.getByLabel("Training password").fill(a.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "My Day", exact: true }),
  ).toBeVisible();
}
async function open(page: Page, name = "TRAINING ALPHA") {
  await page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name, exact: true }) })
    .getByRole("button")
    .click();
  await expect(page.getByRole("region", { name: "SOAP note" })).toBeVisible();
}
async function csrf(context: BrowserContext) {
  return (
    await (await context.request.get(origin + "/api/md02/session")).json()
  ).csrf;
}
async function rows(context: BrowserContext) {
  const token = await csrf(context);
  return (
    await context.request.post(origin + "/api/md02/encounters", {
      headers: { Origin: origin, "X-MD02-CSRF": token },
      data: {},
    })
  ).json();
}
async function reset(context: BrowserContext) {
  const token = await csrf(context);
  const rs = await rows(context);
  const e = rs.find((x: any) => x.encounter_id.endsWith("001"));
  const n = e.notes[0];
  if (!n) return;
  const view = await (
    await context.request.post(origin + "/api/md02/note", {
      headers: { Origin: origin, "X-MD02-CSRF": token },
      data: { note_id: n.note_id },
    })
  ).json();
  const r = await context.request.post(origin + "/api/md02/command", {
    headers: { Origin: origin, "X-MD02-CSRF": token },
    data: {
      encounter_id: e.encounter_id,
      note_id: n.note_id,
      request_id: crypto.randomUUID(),
      row_version: view.row_version,
      assignment_version: view.assignment_version,
      membership_version: view.membership_version,
      command: "save_draft",
      payload: { fields: blank },
    },
  });
  expect(r.ok()).toBeTruthy();
}
async function saved(page: Page) {
  await expect(page.getByRole("status")).toHaveText("Saved");
}
test.describe.serial("MD02 B real local browser and database", () => {
  test("guided fields and completeness persist after save and reload", async ({
    page,
    context,
  }) => {
    await signin(page);
    await open(page);
    await page
      .getByLabel(defs[0], { exact: true })
      .fill("TRAINING persistent draft. No service occurred.");
    await expect(page.getByText("1 of 7 fields supplied")).toBeVisible();
    await saved(page);
    await page.reload();
    await open(page);
    await expect(page.getByLabel(defs[0], { exact: true })).toHaveValue(
      "TRAINING persistent draft. No service occurred.",
    );
    await expect
      .poll(() =>
        page.evaluate(() => ({
          local: localStorage.length,
          session: sessionStorage.length,
        })),
      )
      .toEqual({ local: 0, session: 0 });
    const cookies = await context.cookies(origin + "/api/md02/session");
    expect(cookies.find((c) => c.name === "md02_session")).toMatchObject({
      httpOnly: true,
      sameSite: "Strict",
    });
  });
  test("unsaved navigation offers stay, save and discard", async ({
    page,
    context,
  }) => {
    await signin(page);
    await reset(context);
    await open(page);
    await page
      .getByLabel(defs[0], { exact: true })
      .fill("TRAINING save before leaving");
    await page
      .getByRole("button", { name: "Back to My Day", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Stay here" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page
      .getByRole("button", { name: "Back to My Day", exact: true })
      .click();
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(
      page.getByRole("heading", { name: "My Day", exact: true }),
    ).toBeVisible();
    await open(page);
    await expect(page.getByLabel(defs[0], { exact: true })).toHaveValue(
      "TRAINING save before leaving",
    );
    await page
      .getByLabel(defs[0], { exact: true })
      .fill("TRAINING discard this");
    await page
      .getByRole("button", { name: "Back to My Day", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Discard local changes and continue" })
      .click();
    await open(page);
    await expect(page.getByLabel(defs[0], { exact: true })).toHaveValue(
      "TRAINING save before leaving",
    );
  });
  test("offline failure is explicit and reconnect retries safely", async ({
    page,
    context,
  }) => {
    await signin(page);
    await reset(context);
    await open(page);
    await context.setOffline(true);
    await page
      .getByLabel(defs[0], { exact: true })
      .fill("TRAINING offline edit");
    await expect(page.getByRole("status")).toHaveText("Save failed");
    await expect(
      page.getByRole("button", { name: "Submit for review" }),
    ).toBeDisabled();
    await context.setOffline(false);
    await saved(page);
    await page.reload();
    await open(page);
    await expect(page.getByLabel(defs[0], { exact: true })).toHaveValue(
      "TRAINING offline edit",
    );
  });
  test("lost acknowledgement replays the same request before later edits", async ({
    page,
    context,
  }) => {
    await signin(page);
    await reset(context);
    await open(page);
    const ids: string[] = [];
    let lost = false;
    await page.route("**/api/md02/command", async (route) => {
      const b = route.request().postDataJSON();
      if (b.command === "save_draft") {
        ids.push(b.request_id);
        if (!lost) {
          lost = true;
          await route.fetch();
          await route.abort();
          return;
        }
      }
      await route.continue();
    });
    await page
      .getByLabel(defs[0], { exact: true })
      .fill("TRAINING reached database");
    await expect(page.getByRole("status")).toHaveText("Save failed");
    await page.getByLabel(defs[0], { exact: true }).fill("TRAINING later edit");
    await page.getByRole("button", { name: "Retry save" }).click();
    await saved(page);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[1]);
    await page.reload();
    await open(page);
    await expect(page.getByLabel(defs[0], { exact: true })).toHaveValue(
      "TRAINING later edit",
    );
  });
  test("late acknowledgement never clears newer typing", async ({
    page,
    context,
  }) => {
    await signin(page);
    await reset(context);
    await open(page);
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((r) => (entered = r));
    const held = new Promise<void>((r) => (release = r));
    let first = true;
    await page.route("**/api/md02/command", async (route) => {
      if (route.request().postDataJSON().command === "save_draft" && first) {
        first = false;
        const response = await route.fetch();
        entered();
        await held;
        await route.fulfill({ response });
      } else await route.continue();
    });
    await page.getByLabel(defs[0], { exact: true }).fill("TRAINING first text");
    await started;
    await page.getByLabel(defs[0], { exact: true }).fill("TRAINING newer text");
    release();
    await saved(page);
    await expect(page.getByLabel(defs[0], { exact: true })).toHaveValue(
      "TRAINING newer text",
    );
    await page.reload();
    await open(page);
    await expect(page.getByLabel(defs[0], { exact: true })).toHaveValue(
      "TRAINING newer text",
    );
  });
  test("two tabs compare conflict and require explicit version choice", async ({
    page,
    context,
  }) => {
    await signin(page);
    await reset(context);
    await open(page);
    const tab = await context.newPage();
    await tab.goto("/md02.html");
    await open(tab);
    await page.bringToFront();
    await page
      .getByLabel(defs[0], { exact: true })
      .fill("TRAINING first tab winner");
    await saved(page);
    await tab.bringToFront();
    await tab
      .getByLabel(defs[0], { exact: true })
      .fill("TRAINING second tab edits");
    await expect(tab.getByRole("status")).toHaveText("Conflict");
    await expect(
      tab.getByRole("region", { name: "Conflict comparison" }),
    ).toContainText("TRAINING first tab winner");
    await tab
      .getByRole("button", { name: "Use my entire draft on latest version" })
      .click();
    await tab
      .getByRole("button", { name: "Back to My Day", exact: true })
      .click();
    await tab.getByRole("button", { name: "Save and continue" }).click();
    await open(tab);
    await expect(tab.getByLabel(defs[0], { exact: true })).toHaveValue(
      "TRAINING second tab edits",
    );
    await tab.close();
  });
  test("BETA known missing facts remain blocked even when all fields are supplied", async ({
    page,
  }) => {
    await signin(page);
    await open(page, "TRAINING BETA");
    for (const title of defs)
      await page
        .getByLabel(title, { exact: true })
        .fill("TRAINING unsupported placeholder");
    await saved(page);
    await expect(page.getByText("7 of 7 fields supplied")).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "I checked this saved note against the source",
      }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Submit for review" }),
    ).toBeDisabled();
  });
  test("reviewer cannot see unsubmitted prose and unassigned account has no encounters", async ({
    page,
  }) => {
    await signin(page, "training-reviewer");
    const alpha = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: "TRAINING ALPHA", exact: true }),
    });
    await expect(alpha.getByRole("button")).toBeDisabled();
    await expect(page.locator("body")).not.toContainText(
      "TRAINING second tab edits",
    );
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await signin(page, "training-unassigned");
    await expect(
      page.getByText("No training encounters are assigned to this account."),
    ).toBeVisible();
  });
  test("gateway rejects forged actors and requests missing CSRF", async ({
    page,
    context,
  }) => {
    await signin(page);
    const token = await csrf(context);
    const rs = await rows(context);
    const e = rs.find((x: any) => x.encounter_id.endsWith("001"));
    let r = await context.request.post(origin + "/api/md02/command", {
      headers: { Origin: origin, "X-MD02-CSRF": token },
      data: {
        encounter_id: e.encounter_id,
        note_id: null,
        request_id: crypto.randomUUID(),
        row_version: 0,
        assignment_version: 1,
        membership_version: 1,
        command: "create_note",
        payload: {},
        actor_id: "00000000-0000-0000-0000-000000000102",
      },
    });
    expect(r.status()).toBe(400);
    expect(await r.json()).toEqual({ code: "VALIDATION_FAILED" });
    r = await context.request.post(origin + "/api/md02/encounters", {
      headers: { Origin: origin },
      data: {},
    });
    expect(r.status()).toBe(401);
    expect(await r.json()).toEqual({ code: "NOT_FOUND_OR_NOT_ALLOWED" });
  });
  test("mobile drawer closes and note fields fit the viewport", async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signin(page);
    await reset(context);
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(
      page.getByRole("button", { name: "Close navigation" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Notes", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Notes", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("button", { name: "My Day", exact: true }).click();
    await open(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.getByLabel(defs[0], { exact: true }).focus();
    await page.screenshot({
      path: `${process.env.MD02_EVIDENCE_DIR || "test-results"}/mobile.png`,
      fullPage: true,
    });
  });
  test("source check invalidates on edit; submission locks a snapshot visible to separate reviewer", async ({
    page,
    context,
    browser,
  }) => {
    await signin(page);
    await reset(context);
    await open(page);
    for (const title of defs)
      await page
        .getByLabel(title, { exact: true })
        .fill("TRAINING supplied " + title + "; no service occurred.");
    await saved(page);
    await page
      .getByRole("button", {
        name: "I checked this saved note against the source",
      })
      .click();
    await expect(
      page.getByRole("button", { name: "Submit for review" }),
    ).toBeEnabled();
    await page
      .getByLabel(defs[0], { exact: true })
      .fill("TRAINING revised after source check");
    await saved(page);
    await expect(
      page.getByRole("button", { name: "Submit for review" }),
    ).toBeDisabled();
    await page
      .getByRole("button", {
        name: "I checked this saved note against the source",
      })
      .click();
    let lostSubmission = false;
    const submissionIds: string[] = [];
    await page.route("**/api/md02/command", async (route) => {
      const b = route.request().postDataJSON();
      if (b.command === "submit_note") {
        submissionIds.push(b.request_id);
        if (!lostSubmission) {
          lostSubmission = true;
          await route.fetch();
          await route.abort();
          return;
        }
      }
      await route.continue();
    });
    await page.getByRole("button", { name: "Submit for review" }).click();
    await page.getByRole("button", { name: "Retry last action" }).click();
    await expect(
      page.getByText("Awaiting review", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel(defs[0], { exact: true })).toHaveAttribute(
      "readonly",
      "",
    );
    await page.screenshot({
      path: `${process.env.MD02_EVIDENCE_DIR || "test-results"}/submitted.png`,
      fullPage: true,
    });
    expect(submissionIds).toHaveLength(2);
    expect(submissionIds[0]).toBe(submissionIds[1]);
    const reviewer = await browser.newContext();
    const rp = await reviewer.newPage();
    await signin(rp, "training-reviewer");
    await open(rp);
    await expect(rp.getByLabel(defs[0], { exact: true })).toHaveValue(
      "TRAINING revised after source check",
    );
    await expect(rp.getByLabel(defs[0], { exact: true })).toHaveAttribute(
      "readonly",
      "",
    );
    await expect(rp.getByText("Revision 1 ·", { exact: false })).toBeVisible();
    await reviewer.close();
  });
});

test("revoked account is denied by the API and the open page clears private content", async ({
  page,
}) => {
  const { execFileSync } = await import("node:child_process");
  const ownerSql = (active: boolean) =>
    execFileSync(
      cfg.psql,
      [
        "-X",
        "-qAt",
        "-h",
        cfg.socket,
        "-p",
        String(cfg.port),
        "-U",
        process.env.USER!,
        "-d",
        cfg.database,
        "-v",
        "ON_ERROR_STOP=1",
      ],
      {
        input: `begin; set local role authenticated; set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'; select public.request_user_access('00000000-0000-0000-0000-000000000101',${active},'{}'); commit;`,
        env: Object.fromEntries(
          Object.entries(process.env).filter(([k]) => !k.startsWith("PG")),
        ) as NodeJS.ProcessEnv,
      },
    );
  await signin(page);
  await open(page, "TRAINING BETA");
  try {
    ownerSql(false);
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.locator("textarea")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(
      "TRAINING unsupported placeholder",
    );
  } finally {
    ownerSql(true);
  }
});

test("assignment removal clears an open note even while account membership remains active", async ({
  page,
}) => {
  const { execFileSync } = await import("node:child_process");
  const assign = (version: number, author: number) =>
    execFileSync(
      cfg.psql,
      [
        "-X",
        "-qAt",
        "-h",
        cfg.socket,
        "-p",
        String(cfg.port),
        "-U",
        process.env.USER!,
        "-d",
        cfg.database,
        "-v",
        "ON_ERROR_STOP=1",
      ],
      {
        input: `begin; set local role authenticated; set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000103'; select md02.set_assignment('10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000099',${version},1,'00000000-0000-0000-0000-000000000${author}','00000000-0000-0000-0000-000000000102',true); commit;`,
        env: Object.fromEntries(
          Object.entries(process.env).filter(([k]) => !k.startsWith("PG")),
        ) as NodeJS.ProcessEnv,
      },
    );
  await signin(page);
  await open(page, "TRAINING BETA");
  try {
    assign(1, 104);
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.locator("textarea")).toHaveCount(0);
  } finally {
    assign(2, 101);
  }
});
test("a restored page detects a changed account cookie and clears the previous account view", async ({
  page,
  context,
}) => {
  await signin(page);
  await open(page);
  const reviewer = cfg.accounts.find(
    (a: any) => a.username === "training-reviewer",
  );
  const r = await context.request.post(origin + "/api/md02/login", {
    headers: { Origin: origin },
    data: { username: reviewer.username, password: reviewer.password },
  });
  expect(r.ok()).toBeTruthy();
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    ),
  );
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(page.locator("textarea")).toHaveCount(0);
});
