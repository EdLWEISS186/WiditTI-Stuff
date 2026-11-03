
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.connectOverCDP(
    "http://127.0.0.1:9222"
  );

  const context = browser.contexts()[0];
  const page = await context.newPage();

  try {
    await page.goto(
      "https://lms.widyatama.ac.id/panel/classes/CLASS_ID_2/",
      { waitUntil: "domcontentloaded", timeout: 60000 }
    );

    console.log("URL:", page.url());
    console.log("Judul halaman:", await page.title());

    try {
      await page.locator(".post-item").first().waitFor({
        state: "attached",
        timeout: 15000
      });
    } catch {
      console.log("Selector .post-item tidak muncul dalam 15 detik.");
    }

    const count = await page.locator(".post-item").count();
    console.log("Jumlah post-item:", count);

    if (count === 0) {
      console.log(
        "Teks halaman (awal):",
        (await page.locator("body").innerText()).slice(0, 2500)
      );
      return;
    }

    const posts = page.locator(".post-item");

    for (let i = 0; i < count; i++) {
      const post = posts.nth(i);

      const header = (await post
        .locator(".post-header")
        .innerText()
        .catch(() => "")).trim();

      if (!/menambahkan materi pada/i.test(header)) {
        continue;
      }

      const title = (await post
        .locator(".post-title")
        .innerText()
        .catch(() => "")).trim();

      const files = await post
        .locator(".post-media-item__filename")
        .allInnerTexts()
        .catch(() => []);

      console.log("\n--- POSTING MATERI ---");
      console.log("Header:", JSON.stringify(header));
      console.log("Judul:", JSON.stringify(title));
      console.log("File:", JSON.stringify(files));
    }
  } finally {
    await page.close();
    await browser.close();
  }
})().catch(console.error);
