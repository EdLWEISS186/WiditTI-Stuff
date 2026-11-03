const { chromium } = require("playwright");
const path = require("path");

(async () => {
  let browser;

  try {
    browser = await chromium.connectOverCDP("http://127.0.0.1:9222");

    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes("/sections/"));

    if (!page) throw new Error("Halaman materi tidak ditemukan.");

    const item = page.locator(".post-media-item").filter({
      has: page.locator(".post-media-item__filename", {
        hasText: "The Collapse of Negara Hukum"
      })
    }).first();

    const fileName = await item.locator(
      ".post-media-item__filename"
    ).innerText();

    const button = item.locator("button.post-media-item__download");

    if (!(await button.isVisible())) {
      throw new Error("Tombol unduh PDF kedua tidak ditemukan.");
    }

    console.log("PDF kedua:", fileName);

    const downloadPromise = page.waitForEvent("download", {
      timeout: 15000
    });

    await button.click();

    const download = await downloadPromise;
    const savePath = path.join(
      __dirname, "..", "temp", download.suggestedFilename()
    );

    await download.saveAs(savePath);

    console.log("Download:", download.suggestedFilename());
    console.log("Lokasi:", savePath);
    console.log("Status:", await download.failure() || "Berhasil");

  } catch (error) {
    console.error("PENGUJIAN GAGAL:", error.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
})();
