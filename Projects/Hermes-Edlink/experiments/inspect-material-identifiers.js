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
                    const attributes = element => {
                        if (!element) return null;

                        return Array.from(element.attributes).reduce(
                            (result, attr) => {
                                result[attr.name] = attr.value;
                                return result;
                            },
                            {}
                        );
                    };

                    return {
                        postAttributes: attributes(post),

                        title: post.querySelector(".post-title")
                            ?.innerText?.trim() || null,

                        links: Array.from(
                            post.querySelectorAll("a")
                        ).map(link => ({
                            text: link.innerText.trim(),
                            href: link.getAttribute("href"),
                            attributes: attributes(link)
                        })),

                        fileElements: Array.from(
                            post.querySelectorAll(".post-media-item")
                        ).map(item => ({
                            attributes: attributes(item),
                            filenameAttributes: attributes(
                                item.querySelector(
                                    ".post-media-item__filename"
                                )
                            ),
                            downloadButtonAttributes: attributes(
                                item.querySelector(
                                    "button.post-media-item__download"
                                )
                            )
                        }))
                    };
                });
        });

        const outputPath = path.join(
            __dirname,
            "..",
            "logs",
            "material-identifiers.json"
        );

        fs.writeFileSync(
            outputPath,
            JSON.stringify(result, null, 2),
            "utf8"
        );

        console.log("Jumlah post materi:", result.length);
        console.log(JSON.stringify(result, null, 2));
        console.log("\nFile:", outputPath);

    } finally {
        await browser.close();
    }
}

main().catch(error => {
    console.error("INSPEKSI GAGAL:", error);
    process.exit(1);
});