const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  let browser;

  try {
    browser = await chromium.connectOverCDP("http://127.0.0.1:9222");

    const pages = browser.contexts().flatMap(c => c.pages());
    const page = pages.find(p => p.url().includes("lms.widyatama.ac.id"));

    if (!page) throw new Error("Halaman EdLink tidak ditemukan.");

    const result = await page.evaluate(() => {
      const phrases = [
        "Ada Materi baru @Pendidikan Kewarganegaraan (C)",
        "Materi - Sesi #5 (1)"
      ];

      const matches = [];

      for (const phrase of phrases) {
        const elements = [...document.querySelectorAll("body *")];

        const found = elements.filter(el =>
          (el.innerText || "").trim() === phrase
        );

        for (const el of found.slice(0, 5)) {
          const chain = [];
          let current = el;

          for (let i = 0; current && i < 6; i++, current = current.parentElement) {
            chain.push({
              tag: current.tagName,
              className: typeof current.className === "string"
                ? current.className : "",
              role: current.getAttribute("role"),
              href: current.getAttribute("href"),
              text: (current.innerText || "").trim().slice(0, 400),
              html: current.outerHTML.slice(0, 1800)
            });
          }

          matches.push({ phrase, chain });
        }
      }

      return {
        url: location.href,
        matches
      };
    });

    fs.writeFileSync(
      "logs/notification-link-inspection.json",
      JSON.stringify(result, null, 2),
      "utf8"
    );

    console.log("=== HASIL PEMERIKSAAN TAUTAN ===");
    console.log(JSON.stringify(result, null, 2));
    console.log("\nFile: logs/notification-link-inspection.json");

  } catch (error) {
    console.error("GAGAL:", error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
})();
