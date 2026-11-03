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

    const files = await page.locator("a").evaluateAll(anchors =>
      anchors
        .filter(a => /\.pdf(\?|#|$)/i.test(a.innerText.trim()))
        .map(a => ({
          name: a.innerText.trim(),
          outerHTML: a.outerHTML,
          parentHTML: a.parentElement?.outerHTML || null,
          grandparentHTML: a.parentElement?.parentElement?.outerHTML || null,
          attributes: [...a.attributes].map(attr => ({
            name: attr.name,
            value: attr.value
          }))
        }))
    );

    const result = {
      url: page.url(),
      files
    };

    const outputPath = path.join(
      __dirname, "..", "logs", "material-file-identifiers.json"
    );

    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf8");

    console.log("=== IDENTITAS FILE PDF ===");
    files.forEach((file, index) => {
      console.log(`\nPDF ${index + 1}: ${file.name}`);
      console.log("HTML:", file.outerHTML);
      console.log("Atribut:", file.attributes);
      console.log("Parent HTML:", file.parentHTML);
    });

    console.log("\nFile lengkap:", outputPath);

  } catch (error) {
    console.error("INSPEKSI GAGAL:", error.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
})();
