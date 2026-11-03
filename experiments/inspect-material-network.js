
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const classesPath = path.join(ROOT, "data", "classes.json");
const outputPath = path.join(
  ROOT,
  "logs",
  "material-network-inventory.json"
);

const TARGET_IDS = ["CLASS_ID_3", "CLASS_ID_2"];

function collectKeys(value, prefix = "", result = new Set()) {
  if (!value || typeof value !== "object") return result;

  for (const [key, child] of Object.entries(value)) {
    const current = prefix ? `${prefix}.${key}` : key;
    result.add(current);

    if (child && typeof child === "object") {
      collectKeys(child, current, result);
    }
  }

  return result;
}

(async () => {
  const config = JSON.parse(fs.readFileSync(classesPath, "utf8"));
  const classes = config.classes.filter(c =>
    TARGET_IDS.includes(String(c.id))
  );

  const browser = await chromium.connectOverCDP(
    "http://127.0.0.1:9222"
  );

  const context = browser.contexts()[0];
  const results = [];

  try {
    for (const cls of classes) {
      console.log(`\nMemeriksa: ${cls.name}`);

      const page = await context.newPage();
      const responses = [];
      const seen = new Set();

      page.on("response", async response => {
        try {
          const url = response.url();

          if (!url.startsWith("https://lms.widyatama.ac.id/")) {
            return;
          }

          const contentType =
            response.headers()["content-type"] || "";

          if (!contentType.toLowerCase().includes("json")) {
            return;
          }

          const status = response.status();
          const key = `${status}|${url}`;

          if (seen.has(key)) return;
          seen.add(key);

          const body = await response.json();
          const keys = [...collectKeys(body)];

          responses.push({
            url,
            status,
            contentType,
            topLevelType: Array.isArray(body)
              ? "array"
              : typeof body,
            topLevelKeys:
              body && typeof body === "object"
                ? Object.keys(body)
                : [],
            relevantKeyPaths: keys.filter(k =>
              /file|media|attach|document|upload|material|post|download|url|size|mime|id/i.test(k)
            )
          });
        } catch {
          // Respons yang tidak dapat dibaca dilewati.
        }
      });

      await page.goto(cls.url, {
        waitUntil: "domcontentloaded",
        timeout: 60000
      });

      await page.waitForTimeout(5000);

      results.push({
        classId: cls.id,
        className: cls.name,
        responses
      });

      console.log(`Respons JSON ditemukan: ${responses.length}`);

      await page.close();
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        inspectedAt: new Date().toISOString(),
        classes: results
      },
      null,
      2
    )
  );

  console.log("\n=== SELESAI ===");
  console.log(`Hasil: ${outputPath}`);
})().catch(error => {
  console.error("Gagal:", error.message);
  process.exitCode = 1;
});
