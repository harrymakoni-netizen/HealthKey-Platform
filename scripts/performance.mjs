import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", {
  offline: false,
  latency: 150,
  downloadThroughput: 1_600_000 / 8,
  uploadThroughput: 750_000 / 8,
});
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
const start = Date.now();
await page.goto("http://localhost:3000");
await page.getByRole("button", { name: "Start a private request" }).waitFor();
const ready = Date.now() - start;
const resources = await page.evaluate(() =>
  performance
    .getEntriesByType("resource")
    .map((r) => ({ name: new URL(r.name).pathname, bytes: r.encodedBodySize })),
);
const report = {
  environment:
    "Local production build, Chromium, 390x844, 150ms network latency, 1.6Mbps down/0.75Mbps up, 4x CPU slowdown",
  ready_ms: ready,
  javascript_bytes: resources
    .filter((r) => r.name.endsWith(".js"))
    .reduce((n, r) => n + r.bytes, 0),
  note: "Single synthetic run; not a field performance or uptime guarantee.",
};
writeFileSync("docs/performance.json", JSON.stringify(report, null, 2) + "\n");
console.log(report);
await browser.close();
