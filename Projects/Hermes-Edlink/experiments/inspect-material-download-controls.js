const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

(async () => {
  let browser;

  try {
    browser = await chromium.connectOverCDP("http://127.0.0.1:9222");

    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes("/sections/"));

    if (!page) throw new Error("Halaman materi tidak ditemukan.");

    const result = await page.evaluate(() => {
      const files = [...document.querySelectorAll("a.post-media-item__filename")];

      return files.map((file, index) => {
        let current = file;
        const ancestors = [];

        // Periksa struktur elemen sampai maksimal 6 tingkat.
        for (let i = 0; current && i < 6; i++, current = current.parentElement) {
          ancestors.push({
            level: i,
            tag: current.tagName,
            className: current.className?.toString() || "",
            html: current.outerHTML.slice(0, 5000)
          });
        }

        const container = file.closest(".post-media-item") || file.parentElement?.parentElement;

        const controls = container
          ? [...container.querySelectorAll("a, button, [role='button']")].map(el => ({
              tag: el.tagName,
              text: el.innerText?.trim() || "",
              href: el.getAttribute("href"),
              title: el.getAttribute("title"),
              ariaLabel: el.getAttribute("aria-label"),
              className: el.className?.toString() || "",
              html: el.outerHTML.slice(0, 2000)
            }))
          : [];

        return {
          index: index + 1,
          fileName: file.innerText.trim(),
          ancestors,
          controls
        };
      });
    });

    const outputPath = path.join(
      __dirname, "..", "logs", "material-download-controls.json"
    );

    fs.writeFileSync(outputPath, JSON.stringify({
      url: page.url(),
      files: result
    }, null, 2), "utf8");

    for (const file of result) {
      console.log(`\n=== PDF ${file.index}: ${file.fileName} ===`);

      console.log("\nStruktur induk:");
      for (const ancestor of file.ancestors) {
        console.log(
          `Level ${ancestor.level}: <${ancestor.tag}> class="${ancestor.className}"`
        );
        console.log(ancestor.html);
      }

      console.log("\nKontrol dalam lampiran:");
      console.log(file.controls);
    }

    console.log("\nFile lengkap:", outputPath);

  } catch (error) {
    console.error("INSPEKSI GAGAL:", error.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
})();
