const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

(async () => {
  let browser;

  try {
    browser = await chromium.connectOverCDP("http://127.0.0.1:9222");

    const context = browser.contexts()[0];
    const pages = context.pages();
    const page = pages.find(p =>
      p.url().includes("lms.widyatama.ac.id")
    );

    if (!page) {
      throw new Error("Halaman EdLink tidak ditemukan.");
    }

    console.log("URL sebelum klik:", page.url());

    // Cari hanya item notifikasi materi.
    const matchingItems = await page.locator(".notification__item").evaluateAll(items =>
      items.map((item, index) => {
        const heading = item.querySelector(".notification__text");
        return {
          index,
          heading: heading?.innerText.trim() || "",
          text: item.innerText.trim()
        };
      }).filter(item =>
        /^Ada Materi baru\s*@/i.test(item.heading)
      )
    );

    if (matchingItems.length === 0) {
      throw new Error(
        "Notifikasi materi tidak ditemukan. Buka panel notifikasi terlebih dahulu."
      );
    }

    console.log("\nNotifikasi materi yang ditemukan:");
    matchingItems.forEach((item, i) => {
      console.log(`${i + 1}. ${item.text.replace(/\n/g, " | ")}`);
    });

    // Pengujian hanya menggunakan notifikasi materi pertama.
    const target = matchingItems[0];
    const targetItem = page.locator(".notification__item").nth(target.index);
    const targetLink = targetItem.locator("a.notification__content-nav");

    if (await targetLink.count() === 0) {
      throw new Error("Tautan notifikasi materi tidak ditemukan.");
    }

    console.log("\nMengklik satu notifikasi materi:");
    console.log(target.heading);

    const oldUrl = page.url();
    const pageCountBefore = context.pages().length;

    await targetLink.click();
    await page.waitForTimeout(3000);

    const currentPages = context.pages();
    const newPage = currentPages.find(p =>
      !pages.includes(p) && p.url().includes("lms.widyatama.ac.id")
    );

    const destination = newPage || page;

    const result = await destination.evaluate(() => {
      const visible = el => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== "none" &&
          s.visibility !== "hidden" &&
          r.width > 0 && r.height > 0;
      };

      const headings = [...document.querySelectorAll("h1,h2,h3,h4")]
        .filter(visible)
        .map(el => el.innerText.trim())
        .filter(Boolean);

      const materialLinks = [...document.querySelectorAll("a[href]")]
        .filter(visible)
        .map(a => ({
          text: a.innerText.trim(),
          href: a.href
        }))
        .filter(a =>
          /materi|lecture|bahan ajar|dokumen|unduh|download|file/i.test(a.text)
        );

      return {
        url: location.href,
        title: document.title,
        headings,
        materialLinks: materialLinks.slice(0, 50)
      };
    });

    const output = {
      testedAt: new Date().toISOString(),
      notification: target.text,
      oldUrl,
      destination: result,
      pageCountBefore,
      pageCountAfter: currentPages.length
    };

    const outputPath = path.join(
      __dirname,
      "..",
      "logs",
      "notification-click-test.json"
    );

    fs.writeFileSync(
      outputPath,
      JSON.stringify(output, null, 2),
      "utf8"
    );

    console.log("\n=== HASIL PENGUJIAN KLIK ===");
    console.log("URL tujuan:", result.url);
    console.log("Judul halaman:", result.title);
    console.log("Heading halaman:", result.headings);
    console.log("Tautan terkait materi:", result.materialLinks.length);
    console.log("\nFile hasil:", outputPath);

  } catch (error) {
    console.error("\nPENGUJIAN GAGAL:", error.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
})();
