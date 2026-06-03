/**
 * Browser-driven end-to-end smoke test using headless Chromium.
 *
 * Reads target URLs and credentials from .env / .env.local. Works against
 * either the localhost CSS or the live pod — same script, different env.
 *
 * Usage: npm run smoke:ui   (after dev server + seed)
 */
import { chromium, type BrowserContext, type Page } from "playwright";
import { readEnv, type PersonaEnv } from "./lib/env";

const APP_URL = "http://localhost:3030";
const PROBE_RECEIVE_TIMEOUT_MS = 15_000;
const env = readEnv();

async function signIn(page: Page, persona: PersonaEnv): Promise<void> {
  await page.goto(APP_URL);
  // The shared MindLoginCard shows "Continue with Mind" for a new visitor
  // (and "Continue as <name>" for a returning one). Either way the primary
  // CTA starts the OIDC redirect; persona is chosen at the CSS login page.
  await page.getByRole("button", { name: /continue/i }).first().click();
  // CSS interactive login page:
  await page.waitForURL(/\/\.account\/login\/password\//, { timeout: 20_000 });
  await page.getByLabel(/email/i).fill(persona.email);
  await page.getByLabel(/password/i).fill(persona.password);
  await page.getByRole("button", { name: /log in/i }).click();
  // CSS may show an authorize consent step on first sign-in.
  try {
    await page.getByRole("button", { name: /authorize/i }).click({ timeout: 5_000 });
  } catch {
    // Already authorized previously.
  }
  await page.waitForURL(/\/chat/, { timeout: 30_000 });
  await page.waitForSelector('[data-testid="message-list"], :has-text("No messages yet")', {
    timeout: 15_000,
  });
}

async function main(): Promise<void> {
  console.log("smoke:ui: target =", env.issuer);
  console.log("smoke:ui: room   =", env.roomUrl);

  const probe = `ui-smoke-${Date.now()}`;
  const browser = await chromium.launch({ headless: true });
  let ok = false;
  let ctxA: BrowserContext | undefined;
  let ctxB: BrowserContext | undefined;
  try {
    ctxA = await browser.newContext();
    ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    pageA.on("console", (m) => console.log(`[A console ${m.type()}]`, m.text()));
    pageA.on("pageerror", (e) => console.log(`[A pageerror]`, e.message));
    pageB.on("console", (m) => console.log(`[B console ${m.type()}]`, m.text()));
    pageB.on("pageerror", (e) => console.log(`[B pageerror]`, e.message));

    console.log(`[1/4] ${env.personaA.name} signs in`);
    await signIn(pageA, env.personaA);
    console.log(`[2/4] ${env.personaB.name} signs in`);
    await signIn(pageB, env.personaB);

    console.log(`[3/4] ${env.personaA.name} types probe:`, probe);
    await pageA.locator('[data-testid="compose-input"]').fill(probe);
    await pageA.locator('[data-testid="compose-send"]').click();
    await pageA.waitForFunction(
      (p) =>
        Array.from(document.querySelectorAll('[data-testid="message-body"]')).some(
          (el) => el.textContent?.includes(p),
        ),
      probe,
      { timeout: 10_000 },
    );

    console.log(`[4/4] wait for ${env.personaB.name} to receive`);
    const t0 = Date.now();
    await pageB.waitForFunction(
      (p) =>
        Array.from(document.querySelectorAll('[data-testid="message-body"]')).some(
          (el) => el.textContent?.includes(p),
        ),
      probe,
      { timeout: PROBE_RECEIVE_TIMEOUT_MS },
    );
    console.log(`    ${env.personaB.name} saw the probe in ${Date.now() - t0}ms`);

    console.log("\n✓ UI smoke OK");
    ok = true;
  } finally {
    await ctxA?.close();
    await ctxB?.close();
    await browser.close();
    if (!ok) process.exit(1);
  }
}

main().catch((err) => {
  console.error("\n✗ UI smoke failed:", err);
  process.exit(1);
});
