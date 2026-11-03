
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const config = JSON.parse(
  fs.readFileSync(path.join(ROOT, "data", "classes.json"), "utf8")
);

const TARGET_IDS = ["CLASS_ID_3", "CLASS_ID_2"];

(async () => {
  const browser = await chromium.connectOverCDP(
    "http://127.0.0.1:9222"
  );

  const context = browser.contexts()[0];

  try {
    for (const cls of config.classes.filter(c =>
      TARGET_IDS.includes(String(c.id))
    )) {
      console.log(`\n========== ${cls.name} ==========`);

      const page = await context.newPage();
      const requests = [];
      const seen = new Set();

      page.on("request", request => {
        const url = request.url();

        if (!url.startsWith("https://lms.widyatama.ac.id/")) {
          return;
        }

        const type = request.resourceType();

        if (!["xhr", "fetch", "document"].includes(type)) {
          return;
        }

        const key = `${type}|${request.method()}|${url}`;

        if (seen.has(key)) return;
        seen.add(key);

        requests.push({
          method: request.method(),
          type,
          url
        });
      });

      page.on("response", response => {
        const request = response.request();
        const entry = requests.find(
          r => r.url === request.url() &&
               r.method === request.method()
        );

        if (entry) {
          entry.status = response.status();
          entry.contentType =
            response.headers()["content-type"] || "";
        }
      });

      await page.goto(cls.url, {
        waitUntil: "domcontentloaded",
        timeout: 60000
      });

      await page.waitForTimeout(7000);

      for (const item of requests) {
        console.log(
          `${item.type} | ${item.status ?? "?"} | ${item.contentType ?? "?"} | ${item.url}`
        );
      }

      console.log(`Total request tercatat: ${requests.length}`);

      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error("Gagal:", error.message);
  process.exitCode = 1;
});
