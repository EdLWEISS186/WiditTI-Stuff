
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "data", "classes.json");
const OUTPUT_PATH = path.join(ROOT, "data", "materials-scan.json");
const REPORT_DIR = path.join(ROOT, "output", "reports");
const { CDP_URL } = require("./runtime-config");

function saveJson(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
        filePath,
        JSON.stringify(data, null, 2),
        "utf8"
    );
}

async function scanClass(page, classInfo) {
    console.log(`\nMemeriksa: ${classInfo.name}`);

    await page.goto(classInfo.url, {
        waitUntil: "domcontentloaded",
        timeout: 60000
    });

    await page.waitForSelector(".post-item", {
        timeout: 30000
    }).catch(() => null);

    const materials = await page.locator(".post-item").evaluateAll(posts => {
        const results = [];

        for (const post of posts) {
            // Baca header terlebih dahulu.
            const header = post.querySelector(".post-header");

            if (!header) continue;

            const headerText = header.innerText.trim();

            // Filter berdasarkan LABEL AKTIVITAS EDLink.
            // Nama file tidak digunakan untuk klasifikasi.
            if (!/menambahkan materi pada/i.test(headerText)) {
                continue;
            }

            // Hanya posting Materi yang diperiksa lebih lanjut.
            const titleElement = post.querySelector(".post-title");

            const title = titleElement
                ? titleElement.innerText.trim()
                : "";

            const sessionLink = post.querySelector(
                'a[href*="/sections/"]'
            );

            const sessionUrl = sessionLink
                ? sessionLink.getAttribute("href")
                : null;

            const fileItems = post.querySelectorAll(
                ".post-media-item"
            );

            const files = Array.from(fileItems).map(item => {
                const filenameElement = item.querySelector(
                    ".post-media-item__filename"
                );

                const downloadButton = item.querySelector(
                    "button.post-media-item__download"
                );

                return {
                    filename: filenameElement
                        ? filenameElement.innerText.trim()
                        : null,
                    hasDownloadButton: Boolean(downloadButton)
                };
            }).filter(file => file.filename);

            results.push({
                title,
                headerText,
                sessionUrl,
                files
            });
        }

        return results;
    });

    console.log(`  Posting Materi ditemukan: ${materials.length}`);

    return {
        classId: classInfo.id,
        className: classInfo.name,
        pageUrl: classInfo.url,
        scannedAt: new Date().toISOString(),
        materialCount: materials.length,
        materials
    };
}

async function main() {
    if (!fs.existsSync(CONFIG_PATH)) {
        throw new Error("data/classes.json tidak ditemukan.");
    }

    const config = JSON.parse(
        fs.readFileSync(CONFIG_PATH, "utf8")
    );

    const classes = config.classes;

    if (!Array.isArray(classes) || classes.length === 0) {
        throw new Error("Daftar kelas tidak valid.");
    }

    console.log("=== EDLink MATERIAL SCANNER ===");
    console.log(`Jumlah kelas: ${classes.length}`);
    console.log("Mode: PEMERIKSAAN SAJA");
    console.log("Download: NONAKTIF");
    console.log("Interaksi notifikasi: NONAKTIF");

    const browser = await chromium.connectOverCDP(CDP_URL);

    try {
        const contexts = browser.contexts();

        if (contexts.length === 0) {
            throw new Error("Chrome tidak memiliki browser context.");
        }

        const context = contexts[0];
        const page = await context.newPage();

        const results = [];

        for (const classInfo of classes) {
            try {
                const result = await scanClass(page, classInfo);
                results.push(result);
            } catch (error) {
                console.error(
                    `Gagal memeriksa ${classInfo.name}:`,
                    error.message
                );

                results.push({
                    classId: classInfo.id,
                    className: classInfo.name,
                    pageUrl: classInfo.url,
                    scannedAt: new Date().toISOString(),
                    error: error.message,
                    materialCount: null,
                    materials: []
                });
            }
        }

        const output = {
            scannedAt: new Date().toISOString(),
            totalClasses: classes.length,
            successfulClasses: results.filter(
                item => !item.error
            ).length,
            failedClasses: results.filter(
                item => item.error
            ).length,
            totalMaterials: results.reduce(
                (sum, item) => sum + (item.materialCount || 0),
                0
            ),
            classes: results
        };

        saveJson(OUTPUT_PATH, output);

        const report = [
            "EDLINK MATERIAL SCAN REPORT",
            `Waktu: ${output.scannedAt}`,
            `Total kelas: ${output.totalClasses}`,
            `Berhasil: ${output.successfulClasses}`,
            `Gagal: ${output.failedClasses}`,
            `Total posting Materi: ${output.totalMaterials}`,
            "",
            ...results.flatMap(item => [
                `KELAS: ${item.className}`,
                item.error
                    ? `ERROR: ${item.error}`
                    : `Jumlah Materi: ${item.materialCount}`,
                ...item.materials.map(material =>
                    `  - ${material.title} (${material.files.length} lampiran)`
                ),
                ""
            ])
        ];

        fs.mkdirSync(REPORT_DIR, { recursive: true });

        fs.writeFileSync(
            path.join(REPORT_DIR, "material-scan-report.txt"),
            report.join("\n"),
            "utf8"
        );

        console.log("\n=== HASIL PEMERIKSAAN ===");
        console.log(`Kelas berhasil: ${output.successfulClasses}`);
        console.log(`Kelas gagal: ${output.failedClasses}`);
        console.log(`Total Materi: ${output.totalMaterials}`);
        console.log(`JSON: ${OUTPUT_PATH}`);

    } finally {
        // Disconnect Playwright tanpa menutup Chrome.
        await browser.close();
    }
}

main().catch(error => {
    console.error("\nSCANNER ERROR:", error);
    process.exitCode = 1;
});
