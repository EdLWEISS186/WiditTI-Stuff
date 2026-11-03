const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

async function main() {
    const browser = await chromium.connectOverCDP(
        "http://127.0.0.1:9222"
    );

    try {
        const context = browser.contexts()[0];
        const pages = context.pages();

        const page = pages.find(p =>
            p.url().includes("lms.widyatama.ac.id")
        );

        if (!page) {
            throw new Error("Tab EdLink tidak ditemukan.");
        }

        const targetUrl =
            "https://lms.widyatama.ac.id/panel/classes/CLASS_ID_1/";

        console.log("Membuka halaman kelas Kalkulus I...");
        await page.goto(targetUrl, {
            waitUntil: "domcontentloaded",
            timeout: 60000
        });

        await page.waitForTimeout(3000);

        const result = await page.evaluate(() => {
            const elements = Array.from(
                document.querySelectorAll(
                    '[class*="material" i], ' +
                    '[class*="post" i], ' +
                    '[class*="section" i], ' +
                    '[class*="media" i]'
                )
            );

            return {
                url: location.href,
                title: document.title,
                headings: Array.from(
                    document.querySelectorAll("h1, h2, h3, h4")
                ).map(el => ({
                    tag: el.tagName,
                    text: el.innerText.trim().slice(0, 200),
                    className: el.className
                })),
                candidates: elements.map(el => ({
                    tag: el.tagName,
                    className:
                        typeof el.className === "string"
                            ? el.className
                            : "",
                    text: (el.innerText || "").trim().slice(0, 300),
                    id: el.id || ""
                })).slice(0, 150)
            };
        });

        const outputPath = path.join(
            __dirname,
            "..",
            "logs",
            "class-material-structure.json"
        );

        fs.writeFileSync(
            outputPath,
            JSON.stringify(result, null, 2),
            "utf8"
        );

        console.log("\n=== HASIL INSPEKSI ===");
        console.log("URL:", result.url);
        console.log("Judul:", result.title);
        console.log("Jumlah heading:", result.headings.length);
        console.log("Jumlah kandidat elemen:", result.candidates.length);
        console.log("File:", outputPath);

        console.log("\n=== HEADING HALAMAN ===");
        console.log(result.headings);

        console.log("\n=== KANDIDAT ELEMEN ===");
        console.log(
            result.candidates.slice(0, 30)
        );

    } finally {
        await browser.close();
    }
}

main().catch(error => {
    console.error("INSPEKSI GAGAL:", error.message);
    process.exit(1);
});