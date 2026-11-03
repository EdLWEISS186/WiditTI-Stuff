const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

async function main() {
    const browser = await chromium.connectOverCDP(
        "http://127.0.0.1:9222"
    );

    try {
        const context = browser.contexts()[0];
        const page = context.pages().find(p =>
            p.url().includes("lms.widyatama.ac.id")
        );

        if (!page) {
            throw new Error("Tab EdLink tidak ditemukan.");
        }

        await page.goto(
            "https://lms.widyatama.ac.id/panel/classes/CLASS_ID_1/",
            {
                waitUntil: "domcontentloaded",
                timeout: 60000
            }
        );

        await page.waitForTimeout(3000);

        const result = await page.evaluate(() => {
            const posts = Array.from(
                document.querySelectorAll(".post-item")
            );

            return posts
                .filter(post => {
                    const header = post.querySelector(".post-header");
                    const text = header?.innerText?.toLowerCase() || "";

                    return text.includes("menambahkan materi pada");
                })
                .map(post => {
                    const ancestors = [];

                    let current = post;

                    for (let i = 0; current && i < 5; i++) {
                        ancestors.push({
                            tag: current.tagName,
                            id: current.id || null,
                            className:
                                typeof current.className === "string"
                                    ? current.className
                                    : "",
                            attributes: Array.from(
                                current.attributes || []
                            ).reduce((obj, attr) => {
                                obj[attr.name] = attr.value;
                                return obj;
                            }, {})
                        });

                        current = current.parentElement;
                    }

                    return {
                        title: post.querySelector(".post-title")
                            ?.innerText?.trim() || null,

                        htmlStart: post.outerHTML.slice(0, 2500),

                        ancestors
                    };
                });
        });

        const outputPath = path.join(
            __dirname,
            "..",
            "logs",
            "material-post-details.json"
        );

        fs.writeFileSync(
            outputPath,
            JSON.stringify(result, null, 2),
            "utf8"
        );

        console.log("Jumlah post materi:", result.length);
        console.log("File:", outputPath);

        for (const item of result) {
            console.log("\nMateri:", item.title);
            console.log("Struktur induk:");
            console.log(item.ancestors);
        }

    } finally {
        await browser.close();
    }
}

main().catch(error => {
    console.error("INSPEKSI GAGAL:", error);
    process.exit(1);
});