const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");
const SCAN_PATH = path.join(DATA, "materials-scan.json");
const CLASSES_PATH = path.join(DATA, "classes.json");
const REGISTRY_PATH = path.join(DATA, "materials-registry.json");
const COURSES_DIR = path.join(DATA, "courses");

const APPLY = process.argv.includes("--apply");

function normalize(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function hash(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function materialId(classId, material) {
    return hash([
        classId,
        material.sessionUrl || "",
        normalize(material.title)
    ].join("|"));
}

function attachmentId(id, filename, occurrence) {
    return hash([
        id,
        normalize(filename),
        occurrence
    ].join("|"));
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function courseSlug(name) {
    return String(name).toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

function makeAttachmentIds(id, files) {
    const counts = {};
    return (files || []).map(file => {
        const key = normalize(file.filename);
        counts[key] = (counts[key] || 0) + 1;
        return attachmentId(id, file.filename, counts[key]);
    });
}

function validate() {
    for (const file of [SCAN_PATH, CLASSES_PATH, REGISTRY_PATH]) {
        if (!fs.existsSync(file)) throw new Error(`File tidak ditemukan: ${file}`);
    }

    const scan = readJson(SCAN_PATH);
    const classesData = readJson(CLASSES_PATH);
    const registry = readJson(REGISTRY_PATH);
    const classes = classesData.classes;

    if (!Array.isArray(classes) || !Array.isArray(scan.classes)) {
        throw new Error("Struktur daftar kelas tidak valid.");
    }

    if (
        scan.failedClasses !== 0 ||
        scan.successfulClasses !== scan.totalClasses ||
        scan.totalClasses !== classes.length ||
        scan.classes.length !== classes.length
    ) {
        throw new Error("Scan tidak lengkap atau jumlah kelas tidak cocok.");
    }

    const scannedIds = new Set(scan.classes.map(c => String(c.classId)));
    const configuredIds = new Set(classes.map(c => String(c.id)));

    if (
        scannedIds.size !== classes.length ||
        [...configuredIds].some(id => !scannedIds.has(id))
    ) {
        throw new Error("Daftar kelas pada scan tidak cocok dengan classes.json.");
    }

    if (!registry.materials || !registry.attachments) {
        throw new Error("Struktur materials-registry.json tidak valid.");
    }

    return { scan, classes, registry };
}

function main() {
    const { scan, classes, registry } = validate();

    const report = {
        mode: APPLY ? "APPLY" : "DRY-RUN",
        scannedClasses: scan.totalClasses,
        scannedMaterials: 0,
        scannedAttachments: 0,
        existingMaterials: 0,
        newMaterials: [],
        newAttachments: [],
        conflicts: [],
        missingFiles: [],
        plannedCourseFiles: [],
        writtenCourseFiles: []
    };

    const plans = [];

    for (const classData of scan.classes) {
        const course = classes.find(
            c => String(c.id) === String(classData.classId)
        );

        if (!course) {
            report.conflicts.push({
                classId: classData.classId,
                reason: "Kelas tidak ditemukan"
            });
            continue;
        }

        const folder = `${course.id}-${courseSlug(course.name)}`;
        const dir = path.join(COURSES_DIR, folder);
        const materialsPath = path.join(dir, "materials.json");
        const contentPath = path.join(dir, "content-index.json");
        const infoPath = path.join(dir, "course-info.json");

        if (![materialsPath, contentPath, infoPath].every(fs.existsSync)) {
            report.missingFiles.push(folder);
            continue;
        }

        const courseData = readJson(materialsPath);
        const contentIndex = readJson(contentPath);
        const courseInfo = readJson(infoPath);

        if (
            String(courseData.classId) !== String(classData.classId) ||
            String(contentIndex.classId) !== String(classData.classId) ||
            String(courseInfo.classId) !== String(classData.classId)
        ) {
            report.conflicts.push({
                className: classData.className,
                reason: "classId pada file course tidak konsisten"
            });
            continue;
        }

        const existingMaterials = courseData.materials || {};
        const existingAttachments = courseData.attachments || {};
        const nextMaterials = structuredClone(existingMaterials);
        const nextAttachments = structuredClone(existingAttachments);
        const seenMaterialIds = new Set();

        // Pulihkan metadata lampiran lama dari registry historis.
        for (const material of Object.values(existingMaterials)) {
            for (const id of material.attachments || []) {
                if (nextAttachments[id]) continue;

                const oldAttachment = registry.attachments[id];

                if (!oldAttachment) {
                    report.conflicts.push({
                        className: classData.className,
                        materialTitle: material.title,
                        attachmentId: id,
                        reason: "Metadata lampiran lama tidak ditemukan di registry"
                    });
                    continue;
                }

                nextAttachments[id] = structuredClone(oldAttachment);
            }
        }

        for (const scanned of classData.materials || []) {
            report.scannedMaterials++;
            report.scannedAttachments += (scanned.files || []).length;

            const id = materialId(classData.classId, scanned);

            if (seenMaterialIds.has(id)) {
                report.conflicts.push({
                    className: classData.className,
                    title: scanned.title,
                    reason: "ID materi yang sama muncul lebih dari sekali dalam satu scan"
                });
                continue;
            }
            seenMaterialIds.add(id);

            const ids = makeAttachmentIds(id, scanned.files || []);
            const existing = existingMaterials[id];

            if (existing) {
                report.existingMaterials++;

                const oldIds = [...(existing.attachments || [])].sort();
                const newIds = [...ids].sort();

                if (
                    existing.title !== scanned.title ||
                    existing.sessionUrl !== scanned.sessionUrl ||
                    JSON.stringify(oldIds) !== JSON.stringify(newIds)
                ) {
                    report.conflicts.push({
                        className: classData.className,
                        title: scanned.title,
                        materialId: id,
                        reason: "Identitas materi cocok tetapi metadata atau daftar lampiran berbeda; perlu pemeriksaan manual"
                    });
                }

                continue;
            }

            const now = scan.scannedAt || new Date().toISOString();

            const newRecord = {
                id,
                classId: String(classData.classId),
                className: classData.className,
                title: scanned.title,
                sessionUrl: scanned.sessionUrl || "",
                headerText: scanned.headerText || "",
                firstSeenAt: now,
                lastSeenAt: now,
                appearances: 1,
                attachments: ids
            };

            nextMaterials[id] = newRecord;

            report.newMaterials.push({
                className: classData.className,
                title: scanned.title,
                materialId: id,
                attachmentCount: ids.length
            });

            (scanned.files || []).forEach((file, index) => {
                const aid = ids[index];

                if (nextAttachments[aid]) {
                    report.conflicts.push({
                        className: classData.className,
                        filename: file.filename,
                        reason: "ID lampiran baru sudah ada di indeks"
                    });
                    return;
                }

                const occurrence = index + 1;
                const sameNameCount = (scanned.files || [])
                    .slice(0, index + 1)
                    .filter(f => normalize(f.filename) === normalize(file.filename)).length;

                nextAttachments[aid] = {
                    id: aid,
                    materialId: id,
                    classId: String(classData.classId),
                    className: classData.className,
                    materialTitle: scanned.title,
                    filename: file.filename,
                    occurrence: sameNameCount,
                    hasDownloadButton: Boolean(file.hasDownloadButton),
                    firstSeenAt: now,
                    lastSeenAt: now,
                    appearances: 1,
                    metadataStatus: "limited"
                };

                report.newAttachments.push({
                    className: classData.className,
                    materialTitle: scanned.title,
                    filename: file.filename,
                    attachmentId: aid
                });
            });
        }

        const totalMaterials = Object.keys(nextMaterials).length;
        const totalAttachments = Object.keys(nextAttachments).length;

        const updatedCourseData = {
            ...courseData,
            totalMaterials,
            totalAttachments,
            materials: nextMaterials,
            attachments: nextAttachments
        };

        const changed =
            !courseData.attachments ||
            report.newMaterials.some(m => m.className === classData.className);

        if (changed) {
            plans.push({
                folder,
                materialsPath,
                data: updatedCourseData
            });
            report.plannedCourseFiles.push(folder);
        }
    }

    if (report.missingFiles.length) {
        throw new Error(
            `File course hilang: ${report.missingFiles.join(", ")}. Tidak ada perubahan.`
        );
    }

    if (report.conflicts.length) {
        console.log(JSON.stringify(report, null, 2));
        throw new Error("Konflik ditemukan. Apply dibatalkan; tidak ada file yang ditulis.");
    }

    if (!APPLY) {
        console.log("\n=== COURSE MATERIAL UPDATE — DRY RUN ===\n");
        console.log(JSON.stringify(report, null, 2));
        console.log("\nTidak ada file yang diubah.");
        console.log("Untuk menerapkan setelah meninjau hasil: node scripts/update-course-materials.js --apply");
        return;
    }

    if (plans.length === 0) {
        console.log("Tidak ada perubahan yang perlu diterapkan.");
        return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupRoot = path.join(DATA, "backups", `course-updater-${timestamp}`);

    // Siapkan semua backup dan file sementara sebelum mengganti file asli.
    const staged = [];

    for (const plan of plans) {
        const backupDir = path.join(backupRoot, plan.folder);
        fs.mkdirSync(backupDir, { recursive: true });

        fs.copyFileSync(
            plan.materialsPath,
            path.join(backupDir, "materials.json")
        );

        const tempPath = `${plan.materialsPath}.tmp-${process.pid}`;
        fs.writeFileSync(tempPath, JSON.stringify(plan.data, null, 2), {
            encoding: "utf8",
            flag: "wx"
        });

        staged.push({
            ...plan,
            tempPath,
            backupPath: path.join(backupDir, "materials.json")
        });
    }

    try {
        for (const item of staged) {
            fs.renameSync(item.tempPath, item.materialsPath);
            report.writtenCourseFiles.push(item.folder);
        }
    } catch (error) {
        // Pulihkan semua file yang sudah terganti dari backup.
        for (const item of staged) {
            if (fs.existsSync(item.backupPath)) {
                fs.copyFileSync(item.backupPath, item.materialsPath);
            }
            if (fs.existsSync(item.tempPath)) fs.unlinkSync(item.tempPath);
        }
        throw new Error(`Apply gagal; pemulihan backup dijalankan: ${error.message}`);
    }

    console.log("\n=== COURSE MATERIAL UPDATE — APPLY ===\n");
    console.log(JSON.stringify(report, null, 2));
    console.log(`\nBackup: ${backupRoot}`);
}

main();