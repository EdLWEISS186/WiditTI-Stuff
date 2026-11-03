
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
      console.log(`\nMemeriksa: ${cls.name}`);

      const page = await context.newPage();

      await page.goto(cls.url, {
        waitUntil: "domcontentloaded",
        timeout: 60000
      });

      const result = await page.evaluate(() => {
        const posts = [...document.querySelectorAll(".post-item")];

        return posts
          .filter(post =>
            /menambahkan materi pada/i.test(
              post.querySelector(".post-header")?.innerText || ""
            )
          )
          .map(post => ({
            title:
              post.querySelector(".post-title")?.innerText?.trim() || "",
            html: post.outerHTML
          }));
      });

      const output = path.join(
        ROOT,
        "logs",
        `source-html-${cls.id}.json`
      );

      fs.writeFileSync(output, JSON.stringify(result, null, 2));

      console.log(`Posting materi: ${result.length}`);
      console.log(`File: ${output}`);

      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error("Gagal:", error.message);
  process.exitCode = 1;
});
