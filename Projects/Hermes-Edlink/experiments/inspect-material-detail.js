const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

(async () => {
  let browser;

  try {
    browser = await chromium.connectOverCDP("http://127.0.0.1:9222");

    const context = browser.contexts()[0];
    const page = context.pages().find(p =>
      p.url().includes("/sections/")
    );

    if (!page) {
      throw new Error("Halaman detail materi tidak ditemukan.");
    }

    const result = await page.evaluate(() => {
      const visible = el => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== "none" &&
          s.visibility !== "hidden" &&
          r.width > 0 && r.height > 0;
      };

      const anchors = [...document.querySelectorAll("a")].map(a => ({
        text: a.innerText.trim(),
        href: a.href,
        download: a.getAttribute("download"),
        title: a.getAttribute("title"),
        visible: visible(a)
      }));

      const pdfElements = [...document.querySelectorAll("*")]
        .filter(el => {
          const text = [
            el.innerText,
            el.getAttribute("href"),
            el.getAttribute("src"),
            el.getAttribute("data-file"),
            el.getAttribute("title")
          ].filter(Boolean).join(" ");
          return /\.pdf(\?|#|$)/i.test(text);
        })
        .filter(el => el.children.length === 0 || el.tagName === "A")
        .map(el => ({
          tag: el.tagName,
          text: (el.innerText || "").trim(),
          href: el.href || el.getAttribute("href"),
          src: el.getAttribute("src"),
          dataFile: el.getAttribute("data-file"),
          title: el.getAttribute("title"),
          visible: visible(el)
        }));

      const embedded = [...document.querySelectorAll(
        "iframe, embed, object"
      )].map(el => ({
        tag: el.tagName,
        src: el.src || el.getAttribute("data"),
        type: el.type || el.getAttribute("type"),
        title: el.title
      }));

      const headings = [...document.querySelectorAll("h1,h2,h3,h4")]
        .filter(visible)
        .map(el => el.innerText.trim())
        .filter(Boolean);

      return {
        url: location.href,
        title: document.title,
        headings,
        anchors,
        pdfElements,
        embedded
      };
    });

    const outputPath = path.join(
      __dirname, "..", "logs", "material-detail-inspection.json"
    );

    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf8");

    console.log("=== INSPEKSI DETAIL MATERI ===");
    console.log("URL:", result.url);
    console.log("Judul:", result.title);
    console.log("Heading:", result.headings);
    console.log("Jumlah kandidat PDF:", result.pdfElements.length);
    console.log("Jumlah tautan:", result.anchors.length);
    console.log("Elemen tertanam:", result.embedded);
    console.log("Kandidat PDF:", result.pdfElements);
    console.log("File lengkap:", outputPath);

  } catch (error) {
    console.error("INSPEKSI GAGAL:", error.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
})();
