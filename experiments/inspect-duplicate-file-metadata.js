
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "data", "classes.json");
const OUTPUT_PATH = path.join(
    ROOT,
    "logs",
    "duplicate-file-metadata.json"
);

const TARGETS = [
    "IKATAN KIMIA.pdf",
    "KIM 1 - STRUKTUR ATOM DAN SIFAT DASAR MATERIAL.pdf",
    "Kimia Dasar (Materi dan Pengukuran).pdf",
    "The Collapse of Negara Hukum.pdf"
];

function saveJson(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

async function main() {
    const config = JSON.parse(
        fs.readFileSync(CONFIG_PATH, "utf8")
    );

    const selectedClasses = config.classes.filter(item =>
        ["CLASS_ID_2", "CLASS_ID_3"].includes(item.id)
    );

    const browser = await chromium.connectOverCDP(
        "http://127.0.0.1:9222"
    );

    try {
        const context = browser.contexts()[0];
        const page = await context.newPage();

        const results = [];

        for (const classInfo of selectedClasses) {
            console.log(`\nMemeriksa ${classInfo.name}`);

            await page.goto(classInfo.url, {
                waitUntil: "domcontentloaded",
                timeout: 60000
            });

            await page.waitForSelector(".post-item", {
                timeout: 30000
            }).catch(() => null);

            const records = await page.locator(".post-item")
                .evaluateAll((posts, targets) => {
                    const output = [];

                    for (const post of posts) {
                        const header = post.querySelector(".post-header");

                        if (
                            !header ||
                            !/menambahkan materi pada/i.test(
                                header.innerText
                            )
                        ) {
                            continue;
                        }

                        const title = post.querySelector(".post-title")
                            ?.innerText.trim() || "";

                        const sessionUrl = post.querySelector(
                            'a[href*="/sections/"]'
                        )?.getAttribute("href") || null;

                        const items = post.querySelectorAll(
                            ".post-media-item"
                        );

                        for (const item of items) {
                            const filenameElement = item.querySelector(
                                ".post-media-item__filename"
                            );

                            const filename = filenameElement
                                ?.innerText.trim();

                            if (!filename || !targets.includes(filename)) {
                                continue;
                            }

                            const button = item.querySelector(
                                "button.post-media-item__download"
                            );

                            const attributes = element => {
                                if (!element) return null;

                                return Array.from(element.attributes).map(
                                    attr => ({
                                        name: attr.name,
                                        value: attr.value
                                    })
                                );
                            };

                            const vueInfo = element => {
                                if (!element) return null;

                                const component =
                                    element.__vueParentComponent;

                                if (!component) {
                                    return {
                                        available: false
                                    };
                                }

                                return {
                                    available: true,
                                    componentName:
                                        component.type?.name ||
                                        component.type?.__name ||
                                        null,
                                    propNames: Object.keys(
                                        component.props || {}
                                    ),
                                    setupStateNames: Object.keys(
                                        component.setupState || {}
                                    )
                                };
                            };

                            output.push({
                                title,
                                headerText: header.innerText.trim(),
                                sessionUrl,
                                filename,

                                itemAttributes: attributes(item),
                                filenameAttributes:
                                    attributes(filenameElement),
                                buttonAttributes: attributes(button),

                                itemHtml: item.outerHTML,

                                vue: {
                                    item: vueInfo(item),
                                    filename: vueInfo(filenameElement),
                                    button: vueInfo(button)
                                }
                            });
                        }
                    }

                    return output;
                }, TARGETS);

            console.log(`  Lampiran target ditemukan: ${records.length}`);

            results.push({
                classId: classInfo.id,
                className: classInfo.name,
                records
            });
        }

        const output = {
            inspectedAt: new Date().toISOString(),
            mode: "READ_ONLY",
            results
        };

        saveJson(OUTPUT_PATH, output);

        console.log("\n=== SELESAI ===");
        console.log(
            "Total lampiran diperiksa:",
            results.reduce(
                (sum, item) => sum + item.records.length,
                0
            )
        );
        console.log("Hasil:", OUTPUT_PATH);

    } finally {
        await browser.close();
    }
}

main().catch(error => {
    console.error("ERROR:", error.message);
    process.exitCode = 1;
});
