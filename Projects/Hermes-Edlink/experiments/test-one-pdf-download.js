const { chromium } = require("playwright");
const path = require("path");

(async () => {
  let browser;

  try {
    browser = await chromium.connectOverCDP("http://127.0.0.1:9222");

    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes("/sections/"));

    if (!page) throw new Error("Halaman materi tidak ditemukan.");

    const firstFile = page.locator(".post-media-item").filter({
      has: page.locator(".post-media-item__filename", {
        hasText: "Nations and Nationalism"
      })
    }).first();

    const fileName = await firstFile
      .locator(".post-media-item__filename")
      .innerText();

    const downloadButton = firstFile.locator(
      "button.post-media-item__download"
    );

    if (!(await downloadButton.isVisible())) {
      throw new Error("Tombol unduh PDF pertama tidak terlihat.");
    }

    console.log("PDF yang diuji:", fileName);
    console.log("Memulai pengujian tombol Unduh...");

    const downloadPromise = page.waitForEvent("download", {
      timeout: 15000
    }).catch(() => null);

    const popupPromise = context.waitForEvent("page", {
      timeout: 5000
    }).catch(() => null);

    await downloadButton.click();

    const download = await downloadPromise;
    const popup = await popupPromise;

    if (download) {
      const suggestedName = download.suggestedFilename();
      const savePath = path.join(
        __dirname, "..", "temp", suggestedName
      );

      await download.saveAs(savePath);

      console.log("\nHASIL: DOWNLOAD TERDETEKSI");
      console.log("Nama file:", suggestedName);
      console.log("Lokasi:", savePath);
      console.log("Status:", await download.failure() || "Berhasil");
    } else if (popup) {
      console.log("\nHASIL: TAB BARU TERBUKA");
      console.log("URL:", popup.url());
      console.log("Judul:", await popup.title());
    } else {
      console.log("\nHASIL: TIDAK ADA EVENT DOWNLOAD ATAU TAB BARU");
      console.log("URL halaman:", page.url());
    }

  } catch (error) {
    console.error("\nPENGUJIAN GAGAL:", error.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
})();
