import { defineConfig } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash, X509Certificate } from "node:crypto";
const hosted = process.env.HEALTHKEY_HOSTED_DEMO === "true";
const baseURL = hosted ? "https://healthkey-connect.vercel.app" : "http://localhost:3000";
const proxy = hosted && process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
// Trust only the managed session proxy's public key when inspecting its TLS traffic.
const ca = process.env.HEALTHKEY_BROWSER_PROXY_CA;
const pin = proxy && ca ? createHash("sha256").update(new X509Certificate(readFileSync(ca)).publicKey.export({ type: "spki", format: "der" })).digest("base64") : undefined;
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL,
    headless: true,
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE === "bundled"
          ? undefined
          : process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || "/usr/bin/chromium",
      args: ["--no-sandbox", ...(pin ? [`--ignore-certificate-errors-spki-list=${pin}`] : [])],
      proxy,
    },
    screenshot: "only-on-failure",
    trace: "off",
  },
  reporter: [["list"], ["html", { open: "never" }]],
});
