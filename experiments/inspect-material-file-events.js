const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

(async () => {
  let browser;

  try {
    browser = await chromium.connectOverCDP("http://127.0.0.1:9222");

    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes("/sections/"));

    if (!page) throw new Error("Halaman materi tidak ditemukan.");

    const session = await context.newCDPSession(page);
    await session.send("DOM.enable");
    await session.send("DOMDebugger.enable");

    const document = await session.send("DOM.getDocument");
    const query = await session.send("DOM.querySelectorAll", {
      nodeId: document.root.nodeId,
      selector: "a.post-media-item__filename"
    });

    const files = [];

    for (let i = 0; i < query.nodeIds.length; i++) {
      const nodeId = query.nodeIds[i];

      const node = await session.send("DOM.describeNode", {
        nodeId,
        depth: 4,
        pierce: true
      });

      const listeners = await session.send(
        "DOMDebugger.getEventListeners",
        { objectId: (await session.send("DOM.resolveNode", { nodeId })).object.objectId }
      );

      files.push({
        index: i + 1,
        node: node.node,
        listeners: listeners.listeners.map(listener => ({
          type: listener.type,
          useCapture: listener.useCapture,
          passive: listener.passive,
          once: listener.once,
          handler: listener.handler?.description || null,
          location: listener.scriptId
        }))
      });
    }

    const pageInfo = await page.evaluate(() => ({
      resourceUrls: performance.getEntriesByType("resource")
        .map(r => r.name)
        .filter(url => /file|media|download|attachment|storage|upload|pdf/i.test(url))
        .slice(-100),

      scripts: [...document.scripts]
        .map(s => s.src)
        .filter(Boolean)
    }));

    const result = {
      url: page.url(),
      files,
      pageInfo
    };

    const outputPath = path.join(
      __dirname, "..", "logs", "material-file-event-inspection.json"
    );

    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf8");

    console.log("=== EVENT HANDLER LAMPIRAN PDF ===");

    for (const file of files) {
      console.log(`\nPDF ${file.index}:`);
      console.log("Node:", file.node.nodeName, file.node.attributes);
      console.log("Event listeners:", file.listeners);
    }

    console.log("\nResource terkait file:", pageInfo.resourceUrls);
    console.log("\nFile lengkap:", outputPath);

    await session.detach();

  } catch (error) {
    console.error("INSPEKSI GAGAL:", error.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
})();
