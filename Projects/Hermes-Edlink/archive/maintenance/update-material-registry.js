
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");

const SCAN_PATH = path.join(ROOT, "data", "materials-scan.json");
const REGISTRY_PATH = path.join(ROOT, "data", "materials-registry.json");
const REPORT_DIR = path.join(ROOT, "output", "reports");

function hash(value) {
    return crypto
        .createHash("sha256")
        .update(value)
        .digest("hex");
}

function normalize(value) {
    return String(value || "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveJson(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    fs.writeFileSync(
        filePath,
        JSON.stringify(data, null, 2),
        "utf8"
    );
}

function createMaterialId(classId, material) {
    // Session URL menjadi identitas utama konteks posting.
    // Judul digunakan sebagai penguat identitas.
    const identity = [
        classId,
        material.sessionUrl || "",
        normalize(material.title)
    ].join("|");

    return hash(identity);
}

function createAttachmentId(materialId, filename, occurrence) {
    // File dengan nama sama dalam posting yang berbeda
    // tetap mempunyai identitas berbeda.
    return hash([
        materialId,
        normalize(filename),
        occurrence
    ].join("|"));
}

function main() {
    if (!fs.existsSync(SCAN_PATH)) {
        throw new Error("materials-scan.json tidak ditemukan.");
    }

    const scan = readJson(SCAN_PATH);

    // Jangan memperbarui registry dengan hasil scan parsial.
    if (
        scan.failedClasses !== 0 ||
        scan.successfulClasses !== scan.totalClasses
    ) {
        throw new Error(
            "Scan tidak lengkap. Registry tidak diubah."
        );
    }

    const now = new Date().toISOString();

    const isFirstRun = !fs.existsSync(REGISTRY_PATH);

    const registry = isFirstRun
        ? {
            version: 1,
            createdAt: now,
            updatedAt: now,
            lastScanAt: null,
            totalScans: 0,
            materials: {},
            attachments: {}
        }
        : readJson(REGISTRY_PATH);

    const changes = {
        baseline: isFirstRun,
        newMaterials: [],
        newAttachments: [],
        metadataChanges: [],
        scannedMaterials: 0,
        scannedAttachments: 0
    };

    for (const classData of scan.classes) {
        for (const material of classData.materials) {
            changes.scannedMaterials++;

            const materialId = createMaterialId(
                classData.classId,
                material
            );

            const existingMaterial =
                registry.materials[materialId];

            if (!existingMaterial) {
                registry.materials[materialId] = {
                    id: materialId,
                    classId: classData.classId,
                    className: classData.className,
                    title: material.title,
                    sessionUrl: material.sessionUrl || null,
                    headerText: material.headerText,
                    firstSeenAt: now,
                    lastSeenAt: now,
                    appearances: 1,
                    attachments: []
                };

                if (!isFirstRun) {
                    changes.newMaterials.push({
                        className: classData.className,
                        title: material.title
                    });
                }
            } else {
                existingMaterial.lastSeenAt = now;
                existingMaterial.appearances++;
                existingMaterial.headerText = material.headerText;
            }

            const materialRecord =
                registry.materials[materialId];

            // Hitung kemunculan nama file yang sama
            // di dalam satu posting.
            const occurrences = {};

            for (const file of material.files) {
                const filename = normalize(file.filename);

                occurrences[filename] =
                    (occurrences[filename] || 0) + 1;

                const occurrence = occurrences[filename];

                const attachmentId = createAttachmentId(
                    materialId,
                    file.filename,
                    occurrence
                );

                changes.scannedAttachments++;

                const existingAttachment =
                    registry.attachments[attachmentId];

                if (!existingAttachment) {
                    registry.attachments[attachmentId] = {
                        id: attachmentId,
                        materialId,
                        classId: classData.classId,
                        className: classData.className,
                        materialTitle: material.title,
                        filename: file.filename,
                        occurrence,
                        hasDownloadButton: file.hasDownloadButton,
                        firstSeenAt: now,
                        lastSeenAt: now,
                        appearances: 1,
                        metadataStatus: "limited"
                    };

                    materialRecord.attachments.push(attachmentId);

                    if (!isFirstRun) {
                        changes.newAttachments.push({
                            className: classData.className,
                            materialTitle: material.title,
                            filename: file.filename
                        });
                    }
                } else {
                    existingAttachment.lastSeenAt = now;
                    existingAttachment.appearances++;

                    if (
                        existingAttachment.hasDownloadButton !==
                        file.hasDownloadButton
                    ) {
                        changes.metadataChanges.push({
                            className: classData.className,
                            materialTitle: material.title,
                            filename: file.filename,
                            oldValue: existingAttachment.hasDownloadButton,
                            newValue: file.hasDownloadButton
                        });

                        existingAttachment.hasDownloadButton =
                            file.hasDownloadButton;
                    }
                }
            }
        }
    }

    registry.updatedAt = now;
    registry.lastScanAt = now;
    registry.totalScans++;

    saveJson(REGISTRY_PATH, registry);

    const report = {
        generatedAt: now,
        scanNumber: registry.totalScans,
        baseline: isFirstRun,
        scannedMaterials: changes.scannedMaterials,
        scannedAttachments: changes.scannedAttachments,
        newMaterials: changes.newMaterials,
        newAttachments: changes.newAttachments,
        metadataChanges: changes.metadataChanges
    };

    const reportName = `registry-${now.replace(/[:.]/g, "-")}.json`;

    saveJson(
        path.join(REPORT_DIR, reportName),
        report
    );

    console.log("\n=== MATERIAL REGISTRY ===");

    if (isFirstRun) {
        console.log("Mode: BASELINE PERTAMA");
        console.log("Data awal dicatat, bukan dianggap materi baru.");
    } else {
        console.log("Mode: PEMBANDINGAN");
    }

    console.log("Nomor scan:", registry.totalScans);
    console.log("Posting diperiksa:", changes.scannedMaterials);
    console.log("Lampiran diperiksa:", changes.scannedAttachments);
    console.log("Posting baru:", changes.newMaterials.length);
    console.log("Lampiran baru:", changes.newAttachments.length);
    console.log("Perubahan metadata:", changes.metadataChanges.length);

    console.log("\nRegistry:", REGISTRY_PATH);
    console.log("Laporan:", path.join(REPORT_DIR, reportName));
}

try {
    main();
} catch (error) {
    console.error("\nREGISTRY ERROR:", error.message);
    process.exitCode = 1;
}
