import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL || "http://localhost:3013";
const TARGET_URL = process.env.TARGET_URL || "https://carvo.co.il";

function short(text, max = 2200) {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });

  const events = {
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
    responses: [],
  };

  page.on("console", (msg) => {
    if (msg.type() === "error") events.consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => events.pageErrors.push(err.message));
  page.on("requestfailed", (req) =>
    events.requestFailures.push({
      url: req.url(),
      failure: req.failure()?.errorText || "failed",
    })
  );
  page.on("response", (res) => {
    const url = res.url();
    if (/\/api\/(scan|google|shopify)/.test(url) || /\/report/.test(url)) {
      events.responses.push({ url, status: res.status() });
    }
  });

  const result = {};

  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 120000 });
  result.homeTitle = await page.title();
  result.homeHero = await page.locator("h1").first().innerText();

  await page.getByPlaceholder("https://your-store.com").fill(TARGET_URL);
  await page.getByRole("button", { name: "Start Free Scan" }).click();
  await page.waitForURL(/\/scan\?url=/, { timeout: 30000 });
  result.scanFlowUrl = page.url();

  const onboardingAnswers = [
    "E-commerce store",
    "Shopify",
    "Just checking proactively",
    "Not sure",
  ];

  for (const label of onboardingAnswers) {
    await page.locator("button").filter({ hasText: label }).first().click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForTimeout(300);
  }

  result.reachedChoiceStep = await page
    .getByText("Free scan first or full connected diagnosis")
    .isVisible();

  await page.getByRole("button", { name: "Use free public scan" }).click();

  const loadingBodies = [];
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(2500);
    loadingBodies.push(await page.locator("body").innerText());
    if (loadingBodies[i].includes("Public Scan Summary")) break;
  }
  result.loadingChanged = loadingBodies.length > 1 && loadingBodies[0] !== loadingBodies[1];
  result.loadingSamples = loadingBodies.map((body) => short(body, 900));

  await page.waitForFunction(() => document.body.innerText.includes("Public Scan Summary"), {
    timeout: 120000,
  });

  const reportBody = await page.locator("body").innerText();
  result.reportUrl = page.url();
  result.reportLoaded = reportBody.includes("Public Scan Summary");
  result.pageSpeedState = reportBody.includes("Cached snapshot")
    ? "cached"
    : reportBody.includes("Live snapshot")
      ? "live"
      : reportBody.includes("Unavailable snapshot")
        ? "unavailable"
        : "missing";
  result.summaryHeadlinePresent = reportBody.includes("Public Scan Summary");
  result.pagesScannedPresent = reportBody.includes("Pages We Scanned");
  result.trustSignalsPresent = reportBody.includes("Detected Trust Signals");
  result.quickWinsPresent = reportBody.includes("Recommended Quick Wins");
  result.pageSpeedRetryCopyPresent =
    reportBody.includes("loaded after the report opened") ||
    reportBody.includes("still unavailable right now") ||
    reportBody.includes("cached PageSpeed snapshot");

  const findingButtons = page.locator("button").filter({ hasText: /Rule \d+/ });
  result.findingButtonCount = await findingButtons.count();
  if (result.findingButtonCount > 0) {
    await findingButtons.first().click();
    const expandedBody = await page.locator("body").innerText();
    result.findingExpandShowsEvidence =
      expandedBody.includes("Evidence") && expandedBody.includes("Fix");
  }

  const shopInput = page.locator('input[placeholder="store.myshopify.com"]');
  result.shopifyInputVisible = await shopInput.isVisible();
  if (result.shopifyInputVisible) {
    await shopInput.fill("not-a-store");
    await page.getByRole("button", { name: /Connect Shopify|Reconnect Shopify/ }).click();
    await page.waitForTimeout(2000);
    result.bodyAfterShopifyAttempt = short(await page.locator("body").innerText(), 3000);
    result.urlAfterShopifyAttempt = page.url();
  }

  const googleButtons = page.getByRole("button", { name: /Connect Google|Reconnect Google/ });
  result.googleButtonCount = await googleButtons.count();
  if (result.googleButtonCount > 0) {
    await googleButtons.first().click();
    await page.waitForTimeout(4000);
    result.urlAfterGoogleClick = page.url();
    result.bodyAfterGoogleClick = short(await page.locator("body").innerText(), 2500);
  } else {
    result.urlAfterGoogleClick = page.url();
    result.bodyAfterGoogleClick = short(await page.locator("body").innerText(), 2500);
  }

  const secondPage = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
  const directResult = { consoleErrors: [], pageErrors: [] };
  secondPage.on("console", (msg) => {
    if (msg.type() === "error") directResult.consoleErrors.push(msg.text());
  });
  secondPage.on("pageerror", (err) => directResult.pageErrors.push(err.message));
  await secondPage.goto(
    `${BASE_URL}/report?url=${encodeURIComponent(TARGET_URL)}&scan_type=free&business_type=ecommerce&platform=shopify&blocked_where=proactive&has_gmb=null`,
    { waitUntil: "domcontentloaded", timeout: 120000 }
  );
  await secondPage.waitForTimeout(8000);
  directResult.url = secondPage.url();
  directResult.body = short(await secondPage.locator("body").innerText(), 2200);
  await secondPage.close();

  console.log(
    JSON.stringify(
      {
        result,
        events,
        directResult,
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
