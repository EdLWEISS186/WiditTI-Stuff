const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE_URL = "https://lms.widyatama.ac.id";

async function scanActiveTab(page) {
    return await page.evaluate(() => {
        const clean = value =>
            (value || "").replace(/\s+/g, " ").trim();

        const activeTabs = [
            ...document.querySelectorAll(".nav-tab__item.active")
        ];

        const tabName = activeTabs
            .map(el => clean(el.innerText))
            .join(" ");

        const cards = [
            ...document.querySelectorAll(
                ".tab-pane.active .card_custom-class-item"
            )
        ];

        const uniqueCards = [...new Set(cards)];

        return {
            tabName,
            classes: uniqueCards.map(card => {
                const title = clean(
                    card.querySelector("h3.card__title")?.innerText
                );

                const program = clean(
                    card.querySelector("p.card__subtitle")?.innerText
                );

                // Cari tautan utama melalui parent kartu.
                let links = [];

                const parentLink = card.closest("a[href]");

                if (parentLink) {
                    links.push(parentLink);
                }

                // Tambahkan tautan di dalam kartu jika tersedia.
                links.push(...card.querySelectorAll("a[href]"));

                // Cari tautan kelas utama, bukan sections atau aktivitas.
                const mainLink = links.find(link => {
                    const href = link.getAttribute("href") || "";

                    return /\/panel\/classes\/\d+\/?$/.test(
                        href.split("?")[0]
                    );
                });

                let classId = null;
                let classUrl = null;

                if (mainLink) {
                    const href = mainLink.href;
                    const match = href.match(
                        /\/panel\/classes\/(\d+)\/?$/
                    );

                    if (match) {
                        classId = match[1];
                        classUrl = href;
                    }
                }

                return {
                    id: classId,
                    name: title,
                    program,
                    url: classUrl,
                    description: clean(card.innerText)
                };
            })
        };
    });
}

async function clickTab(page, tabName) {
    const tab = page.locator(".nav-tab__item")
        .filter({ hasText: tabName })
        .first();

    if (!await tab.count()) {
        throw new Error(`Tab ${tabName} tidak ditemukan.`);
    }

    await tab.locator("a").click();

    await page.waitForTimeout(1200);

    return await scanActiveTab(page);
}

async function main() {
    const browser = await chromium.connectOverCDP(
        "http://127.0.0.1:9222"
    );

    try {
        const pages = browser.contexts()
            .flatMap(context => context.pages());

        const page = pages.find(p =>
            p.url().includes("lms.widyatama.ac.id/classes")
        );

        if (!page) {
            throw new Error("Dashboard EdLink tidak ditemukan.");
        }

        console.log("\n=== EDLink CLASS SCANNER V2 ===");

        // Baca kelas akademik.
        const academic = await clickTab(
            page,
            "Kelas Akademik"
        );

        console.log("\nKELAS AKADEMIK");

        academic.classes.forEach(cls => {
            console.log(
                `${cls.id || "ID TIDAK DITEMUKAN"} | ${cls.name}`
            );
        });

        // Baca kelas personal.
        const personal = await clickTab(
            page,
            "Kelas Personal"
        );

        console.log("\nKELAS PERSONAL");

        personal.classes.forEach(cls => {
            console.log(
                `${cls.id || "ID TIDAK DITEMUKAN"} | ${cls.name}`
            );
        });

        // Kembalikan dashboard ke Akademik.
        await clickTab(page, "Kelas Akademik");

        const allClasses = [
            ...academic.classes.map(cls => ({
                ...cls,
                category: "Akademik"
            })),
            ...personal.classes.map(cls => ({
                ...cls,
                category: "Personal"
            }))
        ];

        // Dedup berdasarkan ID.
        const unique = new Map();

        for (const cls of allClasses) {
            const key = cls.id
                ? `${cls.category}-${cls.id}`
                : `${cls.category}-${cls.name}`;

            unique.set(key, cls);
        }

        const result = {
            inspectedAt: new Date().toISOString(),
            dashboard: BASE_URL + "/classes",
            totalClasses: unique.size,
            academicCount: academic.classes.length,
            personalCount: personal.classes.length,
            classes: [...unique.values()]
        };

        const output = path.join(
            __dirname,
            "..",
            "data",
            "classes.json"
        );

        fs.writeFileSync(
            output,
            JSON.stringify(result, null, 2),
            "utf8"
        );

        console.log("\n=== RINGKASAN ===");
        console.log("Akademik:", result.academicCount);
        console.log("Personal:", result.personalCount);
        console.log("Total unik:", result.totalClasses);

        const missingIds = result.classes.filter(cls => !cls.id);

        console.log("ID belum ditemukan:", missingIds.length);

        console.log("\nDatabase:", output);

    } finally {
        await browser.close();
    }
}

main().catch(error => {
    console.error("\nScanner error:", error.message);
    process.exitCode = 1;
});
