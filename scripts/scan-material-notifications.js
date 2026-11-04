const { chromium } = require("playwright");
const { CDP_URL, NOTIFICATION_PATTERN } = require("./runtime-config");
const fs = require("fs");
const path = require("path");

(async () => {
  let browser;

  try {
    browser = await chromium.connectOverCDP(CDP_URL);

    const pages = browser.contexts().flatMap(c => c.pages());
    const page = pages.find(p =>
      p.url().includes("lms.widyatama.ac.id")
    );

    if (!page) {
      const urls = pages.map(p => p.url());
      throw new Error(
        "Halaman EdLink tidak ditemukan. URL yang terbuka: " +
        JSON.stringify(urls)
      );
    }

    const pageInfo = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      bodyText: (document.body?.innerText || "").slice(0, 5000)
    }));

    const loginUrl =
      /\/(login|sign.?in|auth)(\/|$)/i.test(
        new URL(pageInfo.url).pathname
      );

    const loginText =
      /login with google|sign in with google|masuk dengan google/i
        .test(pageInfo.bodyText);

    const passwordField =
      await page.locator('input[type="password"]').count() > 0;

    if (loginUrl || loginText || passwordField) {
      throw new Error(
        "SESI EDLINK KEDALUWARSA: halaman login terdeteksi. " +
        "Scanner dihentikan tanpa memproses notifikasi."
      );
    }

    const notifications = await page.evaluate(() => {
      const items = [...document.querySelectorAll(".notification__item")];

      return items.map(item => {
        const heading = item.querySelector(".notification__text");
        const title = item.querySelector(".notification__text-muted");
        const time = item.querySelector(".notification__text-info");

        return {
          heading: heading?.innerText.trim() || "",
          materialTitle: title?.innerText.trim() || "",
          relativeTime: time?.innerText.trim() || ""
        };
      }).filter(item => {
        const pattern = new RegExp(`^${NOTIFICATION_PATTERN}`, "i");
        return pattern.test(item.heading);
      }).map(item => {
        const pattern = new RegExp(`^${NOTIFICATION_PATTERN}`, "i");
        return {
          ...item,
          className: item.heading
            .replace(pattern, "")
            .trim()
        };
      });
    });

    const output = {
      scannedAt: new Date().toISOString(),
      source: "EdLink Notifications",
      totalMaterialNotifications: notifications.length,
      notifications
    };

    const outputPath = path.join(
      __dirname,
      "..",
      "data",
      "material-notifications.json"
    );

    fs.writeFileSync(
      outputPath,
      JSON.stringify(output, null, 2),
      "utf8"
    );

    console.log("\n=== MATERIAL NOTIFICATION SCANNER ===");
    console.log("Status sesi: halaman EdLink terdeteksi");
    console.log("Total notifikasi materi:", notifications.length);

    for (const item of notifications) {
      console.log("\nKelas :", item.className);
      console.log("Materi:", item.materialTitle);
      console.log("Waktu :", item.relativeTime);
    }

    console.log("\nDatabase:", outputPath);

  } catch (error) {
    console.error("SCANNER GAGAL:", error.message);
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})();
