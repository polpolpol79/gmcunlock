import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL || "http://localhost:3014";
const SCAN_URL = `${BASE_URL}/scan?url=${encodeURIComponent("https://carvo.co.il")}`;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
  page.setDefaultTimeout(120000);
  let googleStartRequestUrl = null;
  page.on("request", (request) => {
    if (request.url().includes("/api/google/oauth/start")) {
      googleStartRequestUrl = request.url();
    }
  });

  await page.goto(SCAN_URL, { waitUntil: "networkidle", timeout: 120000 });
  for (const label of ["E-commerce store", "Shopify", "Just checking proactively", "Not sure"]) {
    await page.locator("button").filter({ hasText: label }).first().click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForTimeout(250);
  }
  await page.getByRole("button", { name: "Use free public scan" }).click();
  await page.waitForFunction(() => document.body.innerText.includes("Public Scan Summary"), {
    timeout: 120000,
  });

  const body = await page.locator("body").innerText();
  const googleButtons = page.getByRole("button", { name: /Connect Google|Reconnect Google/ });
  const count = await googleButtons.count();
  let afterClickUrl = page.url();
  if (count > 0) {
    await googleButtons.first().click();
    await page.waitForTimeout(4000);
    afterClickUrl = page.url();
  }

  console.log(
    JSON.stringify(
      {
        reportUrl: page.url(),
        googleButtonCount: count,
        googleStartRequestUrl,
        body: body.slice(0, 2500),
        afterClickUrl,
      },
      null,
      2
    )
  );

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
