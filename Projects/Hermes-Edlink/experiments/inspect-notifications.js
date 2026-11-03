const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  let browser;

  try {
    browser = await chromium.connectOverCDP("http://127.0.0.1:9222");

    const pages = browser.contexts().flatMap(c => c.pages());
    const page = pages.find(p => p.url().includes("lms.widyatama.ac.id"));

    if (!page) {
      throw new Error("Halaman EdLink tidak ditemukan.");
    }

    const result = await page.evaluate(() => {
      const visible = el => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== "none" &&
          s.visibility !== "hidden" &&
          r.width > 0 && r.height > 0;
      };

      const keywords =
        /materi|lecture|upload|mengunggah|mengupload|diunggah|dibagikan|membagikan|bahan ajar|file baru/i;

      const elements = [
        ...document.querySelectorAll(
          'a, button, [role="button"], [role="dialog"], [role="menu"], [class*="notif"], [class*="notification"]'
        )
      ];

      const candidates = elements
        .filter(visible)
        .map(el => ({
          tag: el.tagName,
          role: el.getAttribute("role"),
          className: typeof el.className === "string" ? el.className : "",
          text: (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 700),
          href: el.getAttribute("href")
        }))
        .filter(item => keywords.test(item.text) || /notif|notification/i.test(item.className));

      const matchingLines = (document.body.innerText || "")
        .split("\n")
        .map(s => s.trim())
        .filter(s => s && keywords.test(s))
        .slice(0, 100);

      return {
        url: location.href,
        title: document.title,
        visibleCandidates: candidates.slice(0, 100),
        materialRelatedLines: matchingLines
      };
    });

    fs.writeFileSync(
      "logs/notification-inspection.json",
      JSON.stringify(result, null, 2),
      "utf8"
    );

    console.log("=== INSPEKSI NOTIFIKASI ===");
    console.log("URL:", result.url);
    console.log("Judul:", result.title);
    console.log("Kandidat elemen:", result.visibleCandidates.length);
    console.log("Baris terkait materi:", result.materialRelatedLines.length);
    console.log("\n=== BARIS TERKAIT MATERI ===");
    console.log(result.materialRelatedLines);
    console.log("\nFile lengkap: logs/notification-inspection.json");

  } catch (error) {
    console.error("INSPEKSI GAGAL:", error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
})();
