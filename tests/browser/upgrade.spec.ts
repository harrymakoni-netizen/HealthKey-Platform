import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
const hosted = process.env.HEALTHKEY_HOSTED_DEMO === "true";
const password = JSON.parse(
  readFileSync(hosted ? ".local/connect-credentials.json" : ".local/secrets.json", "utf8"),
).password;
async function login(page: Page, role: string) {
  await page.goto("/staff");
  await page
    .getByLabel("Work email", { exact: true })
    .fill(role + (hosted ? "@healthkey-connect.test" : "@healthkey.test"));
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Sign in securely", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
}
async function submit(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", {
      name: "Request a private conversation",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Send privately", exact: true })
    .click();
  await expect(page.locator(".receipt strong")).toBeVisible();
  const reference = (await page.locator(".receipt strong").textContent())!;
  await page.getByRole("button", { name: "Show private access code" }).click();
  const code = await page
    .getByLabel("Private access code", { exact: true })
    .inputValue();
  await page
    .getByRole("button", { name: "Check my request", exact: true })
    .click();
  await expect(page.getByRole("log")).toBeVisible();
  return { reference, code };
}
async function fits(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
async function fitsAtRequiredSizes(page: Page) {
  const original = page.viewportSize();
  for (const [width, height] of [[320, 812], [375, 812], [390, 844], [768, 1024], [1024, 768], [1440, 900], [768, 375]]) {
    await page.setViewportSize({ width, height });
    await fits(page);
  }
  if (original) await page.setViewportSize(original);
}
test("synthetic two-provider workflow: private entry, assigned chat, exact consent, dispatch and acknowledgement", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  const { reference, code } = await submit(page);
  await page
    .getByLabel("Message", { exact: true })
    .fill("Synthetic adult: I prefer written communication.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  const intake = await browser.newPage({
    viewport: { width: 375, height: 812 },
  });
  await login(intake, "intake");
  await intake.getByRole("button", { name: new RegExp(reference) }).click();
  await intake
    .getByRole("button", { name: "Acknowledge", exact: true })
    .click();
  await intake
    .getByLabel("Assign practitioner", { exact: true })
    .selectOption({ label: hosted ? "Demo clinician" : "Counsellor" });
  await intake
    .getByRole("button", { name: "Assign practitioner", exact: true })
    .click();
  await expect(intake.getByRole("log")).toHaveCount(0);
  await fitsAtRequiredSizes(intake);
  const practitioner = await browser.newPage({
    viewport: { width: 1024, height: 768 },
  });
  await login(practitioner, "clinician");
  await practitioner
    .getByRole("button", { name: new RegExp(reference) })
    .click();
  await expect(
    practitioner
      .getByRole("log")
      .getByText("Synthetic adult: I prefer written communication."),
  ).toBeVisible();
  await practitioner
    .getByLabel("Message", { exact: true })
    .fill("We can arrange a private conversation.");
  await practitioner
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await expect(
    page.getByRole("log").getByText("We can arrange a private conversation."),
  ).toBeVisible({ timeout: 15000 });
  await practitioner
    .getByRole("button", { name: "Start support", exact: true })
    .click();
  await practitioner
    .getByLabel("Receiving organisation", { exact: true })
    .selectOption({ label: "Bridge Demo Support Centre" });
  await practitioner
    .getByRole("button", { name: "Save referral draft", exact: true })
    .click();
  const referralId = await practitioner
    .locator(".disclosure")
    .first()
    .getAttribute("data-referral-id");
  await fitsAtRequiredSizes(practitioner);
  await practitioner
    .getByRole("button", { name: "Ask for consent", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Approve this disclosure", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await fitsAtRequiredSizes(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/upgrade/mobile-consent.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Approve this disclosure", exact: true })
    .click();
  await expect(
    practitioner.getByRole("button", {
      name: "Send approved referral",
      exact: true,
    }),
  ).toBeVisible({ timeout: 15000 });
  await practitioner
    .getByRole("button", { name: "Send approved referral", exact: true })
    .click();
  const recipient = await browser.newPage({
    viewport: { width: 768, height: 1024 },
  });
  await login(recipient, "receiving");
  await recipient.getByRole("button", { name: /^Referrals/ }).click();
  await expect(
    recipient
      .locator(`[data-referral-id="${referralId}"]`)
      .getByRole("button", {
        name: "Acknowledge referral",
        exact: true,
      }),
  ).toBeVisible();
  await expect(
    recipient.getByText("Synthetic adult: I prefer written communication."),
  ).toHaveCount(0);
  await fitsAtRequiredSizes(recipient);
  await recipient
    .locator(`[data-referral-id="${referralId}"]`)
    .getByRole("button", { name: "Acknowledge referral", exact: true })
    .click();
  await expect(
    page
      .locator(".disclosure")
      .getByText("Acknowledged by staff", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await recipient
    .locator(`[data-referral-id="${referralId}"]`)
    .getByRole("button", { name: "Confirm handover", exact: true })
    .click();
  await expect(
    page
      .locator(".disclosure")
      .getByText("Operational outcome: Staff-confirmed handover", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Clear screen", exact: true }).click();
  await page
    .getByRole("button", { name: "Check my request", exact: true })
    .click();
  await page.getByLabel("Private access code", { exact: true }).fill(code);
  await page
    .getByRole("button", { name: "Open my request", exact: true })
    .click();
  await expect(page.getByRole("log")).toBeVisible();
  await page.getByRole("button", { name: "Quick exit", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "This screen has been cleared." }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("log")).toHaveCount(0);
  for (const p of [intake, practitioner, recipient]) await p.close();
});
test("five languages persist through navigation; historical Shona preference becomes English", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "hk_language", value: "sn", domain: hosted ? "healthkey-connect.vercel.app" : "localhost", path: "/" },
  ]);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  for (const [value, label] of [
    ["nd", "IsiNdebele"],
    ["zu", "isiZulu"],
    ["xh", "isiXhosa"],
    ["af", "Afrikaans"],
    ["en", "English"],
  ]) {
    await page.locator("select").first().selectOption(value);
    await expect(page.locator("html")).toHaveAttribute("lang", value);
    await page.goto("/staff");
    await expect(page.locator("html")).toHaveAttribute("lang", value);
    await page.goto("/");
    await expect(
      page.locator("select").first().locator("option", { hasText: label }),
    ).toBeAttached();
  }
  expect(await page.locator("option[value=sn]").count()).toBe(0);
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
});
test("responsive public, directory, consent entry and provider management at six widths and landscape", async ({
  page,
}) => {
  for (const [width, height] of [
    [320, 812],
    [375, 812],
    [390, 844],
    [768, 1024],
    [1024, 768],
    [1440, 900],
    [768, 375],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await fits(page);
    await page
      .getByRole("button", { name: "Browse services", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Service directory", exact: true }),
    ).toBeVisible();
    await fits(page);
    await page.screenshot({
      path: `docs/upgrade/directory-${width}x${height}.png`,
      fullPage: true,
    });
    await page.goto("/staff");
    await fits(page);
  }
  await page.setViewportSize({ width: 320, height: 812 });
  await login(page, "admin");
  await expect(
    page.getByRole("heading", { name: "Provider management", exact: true }),
  ).toBeVisible();
  await fitsAtRequiredSizes(page);
  await page
    .getByRole("button", { name: "Clinic configuration", exact: true })
    .click();
  await fitsAtRequiredSizes(page);
  await page
    .getByRole("button", { name: "Staff permissions", exact: true })
    .click();
  await fitsAtRequiredSizes(page);
  await page.screenshot({
    path: "docs/upgrade/mobile-administration.png",
    fullPage: true,
  });
});
test("keyboard, 200 percent text, automated accessibility and private-reference rejection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await page.goto("/");
  const accessibility = page.getByRole("button", { name: "Larger text", exact: true });
  await accessibility.focus();
  await page.keyboard.press("Space");
  await expect(accessibility).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Space");
  await expect(accessibility).toHaveAttribute("aria-pressed", "false");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const floating = await accessibility.boundingBox();
  expect(floating).not.toBeNull();
  expect(floating!.x).toBeGreaterThanOrEqual(0);
  expect(floating!.y + floating!.height).toBeLessThanOrEqual(812);
  expect(floating!.width).toBeGreaterThanOrEqual(44);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.addStyleTag({ content: "html{font-size:200%}" });
  await fits(page);
  await page
    .getByRole("button", { name: "Check my request", exact: true })
    .click();
  await page.getByLabel("Private access code", { exact: true }).fill("ABC123");
  await page
    .getByRole("button", { name: "Open my request", exact: true })
    .click();
  await expect(page.locator("p[role=alert]")).toBeVisible();
  await fits(page);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
test("offline never sends messages or approvals automatically; quick exit clears drafts", async ({
  page,
  context,
}) => {
  await submit(page);
  await page
    .getByLabel("Message", { exact: true })
    .fill("Unsent synthetic draft");
  let sends = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/private/room") && r.method() === "POST") sends++;
  });
  await context.setOffline(true);
  await expect(
    page.getByRole("button", { name: "Send message", exact: true }),
  ).toHaveCount(0);
  await context.setOffline(false);
  await page.waitForTimeout(5500);
  expect(sends).toBe(0);
  await page.getByRole("button", { name: "Quick exit", exact: true }).click();
  await expect(page.getByLabel("Message", { exact: true })).toHaveCount(0);
});
test("shared kiosk clears session at timeout and warns with an extension", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/c/HK001?kiosk=1");
  await page
    .getByRole("button", {
      name: "Request a private conversation",
      exact: true,
    })
    .click();
  await page.clock.fastForward(71000);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "I need more time" }).click();
  await page.clock.fastForward(91000);
  await expect(
    page.getByRole("heading", { name: "How can we help?" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Private access code", { exact: true }),
  ).toHaveCount(0);
});
