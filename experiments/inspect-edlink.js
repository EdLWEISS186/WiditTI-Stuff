const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

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

        const result = await page.evaluate(() => {
            const clean = value =>
                (value || "").replace(/\s+/g, " ").trim();

            const visible = el => {
                const rect = el.getBoundingClientRect();
                const style = getComputedStyle(el);

                return rect.width > 0 &&
                    rect.height > 0 &&
                    style.display !== "none" &&
                    style.visibility !== "hidden";
            };

            const headings = [
                ...document.querySelectorAll("h1,h2,h3,h4")
            ].filter(visible)
             .map(el => clean(el.innerText));

            const links = [
                ...document.querySelectorAll("a")
            ].filter(visible).map(el => {
                const rawHref = el.getAttribute("href");
                let safeHref = null;

                try {
                    if (rawHref) {
                        const u = new URL(rawHref, location.href);

                        if (["http:", "https:"].includes(u.protocol)) {
                            safeHref = u.origin + u.pathname;
                        }
                    }
                } catch {
                    safeHref = null;
                }

                return {
                    text: clean(el.innerText),
                    href: safeHref
                };
            }).filter(x => x.text);

            const buttons = [
                ...document.querySelectorAll("button")
            ].filter(visible).map(el => ({
                text: clean(el.innerText),
                ariaLabel: el.getAttribute("aria-label"),
                title: el.getAttribute("title")
            }));

            const cardClasses = [
                ...document.querySelectorAll(
                    '[class*="card"], [class*="course"], [class*="class"]'
                )
            ].filter(visible).map(el => ({
                tag: el.tagName,
                className: String(el.className).slice(0, 160),
                childCount: el.children.length
            }));

            return {
                title: document.title,
                url: location.origin + location.pathname,
                headings,
                links,
                buttons,
                cardCandidates: cardClasses.slice(0, 80)
            };
        });

        const output = path.join(
            __dirname,
            "..",
            "logs",
            "edlink-inspection.json"
        );

        fs.writeFileSync(
            output,
            JSON.stringify(result, null, 2),
            "utf8"
        );

        console.log("\n=== EDLink INSPECTION ===");
        console.log("Title:", result.title);
        console.log("URL:", result.url);

        console.log("\nHeadings:");
        console.log(result.headings);

        console.log("\nLinks:");
        console.log(result.links);

        console.log("\nButtons:");
        console.log(result.buttons);

        console.log(
            "\nCandidate elements:",
            result.cardCandidates.length
        );

        console.log("\nHasil lengkap:", output);

    } finally {
        await browser.close();
    }
}

main().catch(error => {
    console.error("\nInspector error:", error.message);
    process.exitCode = 1;
});
