import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const cfg = JSON.parse(readFileSync(process.env.MD02_GATEWAY_CONFIG!, "utf8")),
  origin = cfg.origin;
const scope = "10000000-0000-0000-0000-000000000001";
let originalId = "",
  correctionId = "",
  revisionOneText = "";
async function signin(p: Page, user: string) {
  const a = cfg.accounts.find((a: any) => a.username === user);
  await p.goto("/md02.html");
  await p.getByLabel("Training username").fill(a.username);
  await p.getByLabel("Training password").fill(a.password);
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    p.getByRole("heading", { name: "My Day", exact: true }),
  ).toBeVisible();
}
async function open(p: Page) {
  await p
    .getByRole("article")
    .filter({
      has: p.getByRole("heading", { name: "TRAINING ALPHA", exact: true }),
    })
    .getByRole("button")
    .click();
  await expect(p.getByRole("region", { name: "SOAP note" })).toBeVisible();
}
function sql(text: string) {
  return execFileSync(
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
      input: text,
      encoding: "utf8",
      env: Object.fromEntries(
        Object.entries(process.env).filter(([k]) => !k.startsWith("PG")),
      ) as NodeJS.ProcessEnv,
    },
  ).trim();
}
async function call(c: BrowserContext, path: string, data: unknown) {
  const s = await (await c.request.get(origin + "/api/md02/session")).json();
  return c.request.post(origin + "/api/md02/" + path, {
    headers: { Origin: origin, "X-MD02-CSRF": s.csrf },
    data,
  });
}
async function details(c: BrowserContext) {
  const r = await call(c, "encounters", {});
  const e = (await r.json()).find((e: any) => e.encounter_id.endsWith("001"));
  return e;
}
const subject = "S · Subjective";
const marker =
  "<script>window.MD02_UNSAFE_EXECUTION=true</script> TRAINING revision two";
test.describe.serial("MD02 C durable review correction and output", () => {
  test("reviewer returns exact revision with mandatory reason; lost response retries once", async ({
    page,
    context,
  }) => {
    await signin(page, "training-reviewer");
    await page
      .getByRole("button", { name: "Review Queue", exact: true })
      .click();
    await open(page);
    originalId = (await details(context)).notes[0].note_id;
    revisionOneText = await page
      .getByLabel(subject, { exact: true })
      .inputValue();
    await expect(
      page.getByRole("button", { name: "Return revision 1", exact: true }),
    ).toBeDisabled();
    await page
      .getByLabel("Reason for return", { exact: true })
      .fill("TRAINING clarify the chosen next step");
    await page.getByRole("button", { name: "Back to Review Queue" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save and continue" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Stay here" }).click();
    const ids: string[] = [];
    let lost = false;
    await page.route("**/api/md02/command", async (route) => {
      const b = route.request().postDataJSON();
      if (b.command === "return_note") {
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
      .getByRole("button", { name: "Return revision 1", exact: true })
      .click();
    await page.getByRole("button", { name: "Retry last action" }).click();
    await expect(
      page.getByText("Returned for revision", { exact: true }).first(),
    ).toBeVisible();
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
    await expect(
      page.getByRole("region", { name: "Reviewer feedback" }),
    ).toContainText("TRAINING clarify the chosen next step");
    await expect(page.getByLabel(subject, { exact: true })).toHaveAttribute(
      "readonly",
      "",
    );
  });
  test("returned work revises and resubmits while revision one and feedback remain unchanged", async ({
    page,
  }) => {
    await signin(page, "training-author");
    await open(page);
    await expect(
      page.getByRole("region", { name: "Reviewer feedback" }),
    ).toContainText("TRAINING clarify the chosen next step");
    await page.getByLabel(subject, { exact: true }).fill(marker);
    await expect(page.getByRole("status")).toHaveText("Saved");
    await expect(
      page.getByRole("button", { name: "Submit for review" }),
    ).toBeDisabled();
    await page
      .getByRole("button", {
        name: "I checked this saved note against the source",
      })
      .click();
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(
      page.getByText("Awaiting review", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "View revision 1", exact: true })
      .click();
    await expect(page.getByLabel(subject, { exact: true })).toHaveValue(
      revisionOneText,
    );
    await page
      .getByRole("button", { name: "Show latest revision", exact: true })
      .click();
    await expect(page.getByLabel(subject, { exact: true })).toHaveValue(marker);
    expect(
      await page.evaluate(() => (window as any).MD02_UNSAFE_EXECUTION),
    ).toBeUndefined();
  });
  test("reviewing an old revision is blocked and competing decisions cannot both commit", async ({
    page,
    context,
  }) => {
    await signin(page, "training-reviewer");
    await open(page);
    await page
      .getByRole("button", { name: "View revision 1", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Accept revision 2 in pilot" }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Show latest revision", exact: true })
      .click();
    const other = await context.newPage();
    await other.goto("/md02.html");
    await open(other);
    await other
      .getByLabel("Reason for return", { exact: true })
      .fill("TRAINING competing return");
    await page.bringToFront();
    const ids: string[] = [];
    let lost = false;
    await page.route("**/api/md02/command", async (route) => {
      const b = route.request().postDataJSON();
      if (b.command === "accept_note") {
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
      .getByRole("button", { name: "Accept revision 2 in pilot" })
      .click();
    await page.getByRole("button", { name: "Retry last action" }).click();
    await expect(
      page.getByText("Reviewed in pilot", { exact: true }).first(),
    ).toBeVisible();
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
    await other.bringToFront();
    await other
      .getByRole("button", { name: "Return revision 2", exact: true })
      .click();
    await expect(other.getByRole("alert")).toContainText(
      "Another session changed",
    );
    expect(
      sql(
        `select count(*) from md02.review_action where note_id='${originalId}' and revision=2`,
      ),
    ).toBe("1");
    await other.close();
  });
  test("Observer sees submitted snapshots and preview but cannot export or mutate", async ({
    page,
    context,
  }) => {
    await signin(page, "training-observer");
    await open(page);
    await expect(page.getByLabel(subject, { exact: true })).toHaveAttribute(
      "readonly",
      "",
    );
    await expect(
      page.getByRole("region", { name: "Reviewer actions" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Download training note (.txt)" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Open training preview" }).click();
    await expect(
      page.getByLabel("Training note preview", { exact: true }),
    ).toContainText(marker);
    expect(
      await page.evaluate(() => (window as any).MD02_UNSAFE_EXECUTION),
    ).toBeUndefined();
    const r = await call(context, "output", {
      note_id: originalId,
      revision: 2,
      mode: "export",
    });
    expect(r.status()).toBe(401);
    expect(await r.json()).toEqual({ code: "NOT_FOUND_OR_NOT_ALLOWED" });
  });
  test("Observer feature disabled denies direct preview and clears the open note", async ({
    page,
    context,
  }) => {
    await signin(page, "training-observer");
    await open(page);
    sql(`update md02.scope set observer_enabled=false where id='${scope}'`);
    try {
      const r = await call(context, "output", {
        note_id: originalId,
        revision: 2,
        mode: "preview",
      });
      expect(r.status()).toBe(401);
      await page.evaluate(() =>
        window.dispatchEvent(
          new PageTransitionEvent("pageshow", { persisted: true }),
        ),
      );
      await expect(
        page.getByRole("button", { name: "Sign in", exact: true }),
      ).toBeVisible();
      await expect(page.locator("textarea")).toHaveCount(0);
    } finally {
      sql(`update md02.scope set observer_enabled=true where id='${scope}'`);
    }
  });
  test("exact-revision preview escapes markup and real text download matches it", async ({
    page,
  }) => {
    await signin(page, "training-author");
    await open(page);
    await page.getByRole("button", { name: "Open training preview" }).click();
    const preview = page.getByLabel("Training note preview", { exact: true });
    await expect(preview).toContainText(marker);
    expect(
      await page.evaluate(() => (window as any).MD02_UNSAFE_EXECUTION),
    ).toBeUndefined();
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download training note (.txt)" })
      .click();
    const d = await download;
    const path = `${process.env.MD02_EVIDENCE_DIR || "test-results"}/export-revision2.txt`;
    await d.saveAs(path);
    const text = readFileSync(path, "utf8");
    expect(text).toBe(await preview.innerText());
    expect(text).toContain("Revision: 2");
    expect(text).toContain("Reviewed in pilot");
    expect(text.split(marker)).toHaveLength(2);
    expect(
      text.match(
        /FICTIONAL TRAINING DATA — NOT A SERVICE RECORD — NOT SIGNED/g,
      ),
    ).toHaveLength(2);
    expect(
      sql(
        `select count(*) from md02.event where note_id='${originalId}' and revision=2 and kind='export'`,
      ),
    ).not.toBe("0");
  });
  test("reasoned correction creates one linked draft and preserves the reviewed original", async ({
    page,
    context,
  }) => {
    await signin(page, "training-author");
    await open(page);
    await expect(
      page.getByRole("button", { name: "Start linked correction" }),
    ).toBeDisabled();
    await page
      .getByLabel("Correction reason", { exact: true })
      .fill("TRAINING correct the practice wording");
    let lost = false;
    const ids: string[] = [];
    await page.route("**/api/md02/command", async (route) => {
      const b = route.request().postDataJSON();
      if (b.command === "start_correction") {
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
    await page.getByRole("button", { name: "Start linked correction" }).click();
    await page.getByRole("button", { name: "Retry last action" }).click();
    await expect(
      page.getByText(
        "Linked correction · TRAINING correct the practice wording",
        { exact: true },
      ),
    ).toBeVisible();
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
    const rows = await details(context);
    expect(rows.notes).toHaveLength(2);
    correctionId = rows.notes.find(
      (n: any) => n.parent_id === originalId,
    ).note_id;
    await page
      .getByLabel(subject, { exact: true })
      .fill("TRAINING corrected wording");
    await expect(page.getByRole("status")).toHaveText("Saved");
    await expect(
      page.getByRole("button", { name: "Submit for review" }),
    ).toBeDisabled();
    await page
      .getByRole("button", {
        name: "I checked this saved note against the source",
      })
      .click();
    await page.getByRole("button", { name: "Submit for review" }).click();
    await page
      .getByRole("button", { name: "Open original note", exact: true })
      .click();
    await expect(page.getByLabel(subject, { exact: true })).toHaveValue(marker);
    await expect(
      page.getByRole("button", { name: "Open active correction" }),
    ).toBeVisible();
    expect(sql(`select state from md02.note where id='${originalId}'`)).toBe(
      "reviewed",
    );
    expect(
      sql(`select count(*) from md02.revision where note_id='${originalId}'`),
    ).toBe("2");
  });
  test("reviewer accepts correction independently; original and correction stay navigable", async ({
    page,
  }) => {
    await signin(page, "training-reviewer");
    await page
      .getByRole("button", { name: "Review Queue", exact: true })
      .click();
    await open(page);
    await expect(page.getByLabel(subject, { exact: true })).toHaveValue(
      "TRAINING corrected wording",
    );
    await page
      .getByRole("button", { name: "Accept revision 1 in pilot" })
      .click();
    await expect(
      page.getByText("Reviewed in pilot", { exact: true }).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Open training preview" }).click();
    await expect(
      page.getByLabel("Training note preview", { exact: true }),
    ).toContainText("Correction of note: " + originalId);
    await expect(
      page.getByLabel("Training note preview", { exact: true }),
    ).toContainText("TRAINING correct the practice wording");
    await page
      .getByRole("button", { name: "Open original note", exact: true })
      .click();
    await expect(page.getByLabel(subject, { exact: true })).toHaveValue(marker);
    expect(sql(`select state from md02.note where id='${correctionId}'`)).toBe(
      "reviewed",
    );
  });
  test("changing revision or closing a pending preview ignores the late response", async ({
    page,
  }) => {
    await signin(page, "training-author");
    await open(page);
    await page
      .getByRole("button", { name: "Open original note", exact: true })
      .click();
    let release!: () => void, entered!: () => void;
    let hold = true;
    let started = new Promise<void>((r) => (entered = r));
    let held = new Promise<void>((r) => (release = r));
    await page.route("**/api/md02/output", async (route) => {
      if (hold) {
        hold = false;
        const r = await route.fetch();
        entered();
        await held;
        await route.fulfill({ response: r });
      } else await route.continue();
    });
    await page.getByRole("button", { name: "Open training preview" }).click();
    await started;
    await page
      .getByRole("button", { name: "View revision 1", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Open training preview" }),
    ).toBeEnabled();
    release();
    await page.getByRole("button", { name: "Open training preview" }).click();
    await expect(
      page.getByLabel("Training note preview", { exact: true }),
    ).toContainText("Revision: 1");
    await expect(
      page.getByLabel("Training note preview", { exact: true }),
    ).not.toContainText(marker);
    hold = true;
    started = new Promise<void>((r) => (entered = r));
    held = new Promise<void>((r) => (release = r));
    await page.getByRole("button", { name: "Open training preview" }).click();
    await started;
    await page.getByRole("button", { name: "Close preview" }).click();
    release();
    await expect(
      page.getByLabel("Training note preview", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Open training preview" }),
    ).toBeEnabled();
  });
  test("unassigned and cross-scope direct output requests disclose no snapshot", async ({
    page,
    context,
  }) => {
    await signin(page, "training-unassigned");
    let r = await call(context, "output", {
      note_id: originalId,
      revision: 2,
      mode: "preview",
    });
    expect(r.status()).toBe(401);
    expect(await r.json()).toEqual({ code: "NOT_FOUND_OR_NOT_ALLOWED" });
    await page.goto("/md02.html");
    await signin(page, "training-author");
    r = await call(context, "output", {
      note_id: "aaaaaaaa-0000-0000-0000-000000000001",
      revision: 1,
      mode: "export",
    });
    expect(r.status()).toBe(401);
    expect(await r.json()).toEqual({ code: "NOT_FOUND_OR_NOT_ALLOWED" });
  });
});
