const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");

function normalize(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function hash(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function createMaterialId(classId, material) {
    return hash([
        classId,
        material.sessionUrl || "",
        normalize(material.title)
    ].join("|"));
}

function createAttachmentId(materialId, filename, occurrence) {
    return hash([
        materialId,
        normalize(filename),
        occurrence
    ].join("|"));
}

function attachmentIds(materialId, files) {
    const occurrences = {};
    return files.map(file => {
        const filename = normalize(file.filename);
        occurrences[filename] = (occurrences[filename] || 0) + 1;
        return createAttachmentId(materialId, file.filename, occurrences[filename]);
    });
}

function assert(condition, message) {
    if (!condition) throw new Error(`GAGAL: ${message}`);
    console.log(`LULUS: ${message}`);
}

function main() {
    const scanPath = path.join(ROOT, "data", "materials-scan.json");
    const scan = JSON.parse(fs.readFileSync(scanPath, "utf8"));

    if (scan.failedClasses !== 0 || scan.successfulClasses !== scan.totalClasses) {
        throw new Error("Scan tidak lengkap. Pengujian dibatalkan.");
    }

    const firstClass = scan.classes.find(c => c.materials.length > 0);
    const original = firstClass.materials[0];
    const materialId = createMaterialId(firstClass.classId, original);

    const originalAttachmentIds = attachmentIds(materialId, original.files || []);

    // 1. Materi lama dipindai ulang.
    const repeatedId = createMaterialId(firstClass.classId, { ...original });
    assert(materialId === repeatedId, "Materi lama tetap dikenali dengan ID yang sama");

    // 2. Materi baru dengan konteks sesi berbeda.
    const newMaterial = {
        ...original,
        sessionUrl: `${original.sessionUrl}-simulation`,
        title: `${original.title} [SIMULASI]`
    };
    const newMaterialId = createMaterialId(firstClass.classId, newMaterial);
    assert(newMaterialId !== materialId, "Materi baru menghasilkan ID berbeda");

    // 3. Lampiran baru pada materi lama.
    const simulatedFiles = [
        ...(original.files || []),
        { filename: "lampiran-baru-simulasi.pdf" }
    ];
    const simulatedAttachmentIds = attachmentIds(materialId, simulatedFiles);
    const newAttachmentId = simulatedAttachmentIds[simulatedAttachmentIds.length - 1];
    assert(!originalAttachmentIds.includes(newAttachmentId), "Lampiran baru menghasilkan ID baru");

    // 4. Nama file sama pada materi berbeda.
    const otherMaterialId = createMaterialId(firstClass.classId, newMaterial);
    const sameFilenameOtherMaterial = createAttachmentId(
        otherMaterialId,
        original.files?.[0]?.filename || "contoh.pdf",
        1
    );
    assert(
        !originalAttachmentIds.includes(sameFilenameOtherMaterial),
        "Nama file sama pada materi berbeda tidak bertabrakan"
    );

    // 5. Nama file sama berulang dalam satu materi.
    const duplicateIds = attachmentIds(materialId, [
        { filename: "file-sama-simulasi.pdf" },
        { filename: "file-sama-simulasi.pdf" }
    ]);
    assert(
        duplicateIds[0] !== duplicateIds[1],
        "Nama file berulang dibedakan dengan occurrence"
    );

    console.log("\n=== RINGKASAN PENGUJIAN ===");
    console.log("Status: SEMUA PENGUJIAN LULUS");
    console.log("Mode: SIMULASI DI MEMORI");
    console.log("Data course asli: TIDAK DIUBAH");
}

main();