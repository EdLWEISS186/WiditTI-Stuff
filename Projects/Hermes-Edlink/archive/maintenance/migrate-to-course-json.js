
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");

const CLASSES_PATH = path.join(DATA, "classes.json");
const REGISTRY_PATH = path.join(DATA, "materials-registry.json");
const COURSES_DIR = path.join(DATA, "courses");
const REPORT_DIR = path.join(DATA, "migration-reports");

const APPLY = process.argv.includes("--apply");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeNewJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  // Jangan pernah menimpa file migrasi yang sudah ada.
  fs.writeFileSync(
    filePath,
    JSON.stringify(value, null, 2),
    { encoding: "utf8", flag: "wx" }
  );
}

function normalize(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeCourseFolder(course) {
  return `${course.id}-${slugify(course.name)}`;
}

function validateObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} bukan object JSON yang valid.`);
  }
}

function main() {
  if (!fs.existsSync(CLASSES_PATH)) {
    throw new Error("data/classes.json tidak ditemukan.");
  }

  if (!fs.existsSync(REGISTRY_PATH)) {
    throw new Error("data/materials-registry.json tidak ditemukan.");
  }

  const classesData = readJson(CLASSES_PATH);
  const registry = readJson(REGISTRY_PATH);

  if (!Array.isArray(classesData.classes)) {
    throw new Error("Field classes pada classes.json tidak valid.");
  }

  validateObject(registry.materials, "registry.materials");
  validateObject(registry.attachments, "registry.attachments");

  const courses = classesData.classes;

  if (courses.length === 0) {
    throw new Error("Daftar mata kuliah kosong.");
  }

  const courseById = new Map();

  for (const course of courses) {
    const id = String(course.id);

    if (!id || !course.name) {
      throw new Error("Ada data kelas tanpa ID atau nama.");
    }

    if (courseById.has(id)) {
      throw new Error(`ID kelas duplikat: ${id}`);
    }

    courseById.set(id, course);
  }

  // Siapkan struktur untuk setiap mata kuliah.
  const output = new Map();

  for (const course of courses) {
    const folderName = makeCourseFolder(course);

    output.set(String(course.id), {
      course,
      folderName,
      materials: {},
      contentGroups: {}
    });
  }

  let totalMaterials = 0;
  let totalAttachments = 0;
  let verifiedAttachments = 0;
  let unverifiedAttachments = 0;

  // Migrasikan postingan.
  for (const [materialId, material] of Object.entries(
    registry.materials
  )) {
    const classId = String(material.classId);
    const target = output.get(classId);

    if (!target) {
      throw new Error(
        `Mata kuliah tidak ditemukan untuk materi ${materialId}: ${classId}`
      );
    }

    if (target.materials[materialId]) {
      throw new Error(`ID materi duplikat: ${materialId}`);
    }

    target.materials[materialId] = {
      ...material,
      attachments: []
    };

    totalMaterials++;
  }

  // Migrasikan lampiran dan indeks konten.
  for (const [attachmentId, attachment] of Object.entries(
    registry.attachments
  )) {
    const classId = String(attachment.classId);
    const target = output.get(classId);

    if (!target) {
      throw new Error(
        `Mata kuliah tidak ditemukan untuk lampiran ${attachmentId}: ${classId}`
      );
    }

    const material =
      target.materials[attachment.materialId];

    if (!material) {
      throw new Error(
        `Materi induk tidak ditemukan untuk lampiran ${attachmentId}`
      );
    }

    if (material.attachments.includes(attachmentId)) {
      throw new Error(`Lampiran duplikat: ${attachmentId}`);
    }

    // Pertahankan seluruh metadata lama.
    material.attachments.push(attachmentId);

    totalAttachments++;

    if (attachment.contentHash) {
      const contentHash = String(
        attachment.contentHash
      ).toUpperCase();

      if (!/^[A-F0-9]{64}$/.test(contentHash)) {
        throw new Error(
          `SHA-256 tidak valid pada lampiran ${attachmentId}`
        );
      }

      verifiedAttachments++;

      if (!target.contentGroups[contentHash]) {
        target.contentGroups[contentHash] = {
          contentHash,
          algorithm: "SHA-256",
          contentSize: attachment.contentSize ?? null,
          firstVerifiedAt:
            attachment.contentVerifiedAt || null,
          lastVerifiedAt:
            attachment.contentVerifiedAt || null,
          occurrences: []
        };
      }

      const group = target.contentGroups[contentHash];

      if (
        group.contentSize !== null &&
        attachment.contentSize !== undefined &&
        group.contentSize !== attachment.contentSize
      ) {
        throw new Error(
          `Ukuran berbeda untuk hash yang sama: ${contentHash}`
        );
      }

      if (
        attachment.contentVerifiedAt &&
        (!group.lastVerifiedAt ||
          attachment.contentVerifiedAt > group.lastVerifiedAt)
      ) {
        group.lastVerifiedAt = attachment.contentVerifiedAt;
      }

      group.occurrences.push({
        attachmentId,
        materialId: attachment.materialId,
        materialTitle: attachment.materialTitle,
        filename: attachment.filename,
        classId,
        className: attachment.className
      });
    } else {
      unverifiedAttachments++;
    }
  }

  // Siapkan seluruh file output.
  const files = [];

  for (const [classId, target] of output.entries()) {
    const course = target.course;

    const courseInfo = {
      version: 1,
      classId,
      name: course.name,
      program: course.program || null,
      url: course.url || null,
      category: course.category || null,
      migratedAt: new Date().toISOString()
    };

    const materialsData = {
      version: 1,
      classId,
      className: course.name,
      migratedAt: new Date().toISOString(),
      totalMaterials: Object.keys(target.materials).length,
      totalAttachments: Object.values(target.materials)
        .reduce((sum, item) => sum + item.attachments.length, 0),
      materials: target.materials
    };

    const contentData = {
      version: 1,
      classId,
      className: course.name,
      algorithm: "SHA-256",
      updatedAt: new Date().toISOString(),
      totalVerifiedAttachments: Object.values(
        target.contentGroups
      ).reduce(
        (sum, group) => sum + group.occurrences.length,
        0
      ),
      uniqueContents: Object.keys(target.contentGroups).length,
      contents: target.contentGroups
    };

    const base = path.join(
      COURSES_DIR,
      target.folderName
    );

    files.push({
      path: path.join(base, "course-info.json"),
      data: courseInfo
    });

    files.push({
      path: path.join(base, "materials.json"),
      data: materialsData
    });

    files.push({
      path: path.join(base, "content-index.json"),
      data: contentData
    });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? "APPLY" : "DRY-RUN",
    totalCourses: courses.length,
    totalMaterials,
    totalAttachments,
    verifiedAttachments,
    unverifiedAttachments,
    outputFiles: files.map(file =>
      path.relative(ROOT, file.path)
    )
  };

  // Validasi semua target belum ada sebelum menulis apa pun.
  if (APPLY) {
    const conflicts = files.filter(file =>
      fs.existsSync(file.path)
    );

    if (conflicts.length > 0) {
      throw new Error(
        "Migrasi dibatalkan karena file tujuan sudah ada:\n" +
        conflicts.map(x => x.path).join("\n")
      );
    }

    const backupDir = path.join(DATA, "legacy-backup");

    if (fs.existsSync(backupDir)) {
      throw new Error(
        "data/legacy-backup sudah ada. Periksa dahulu sebelum migrasi."
      );
    }

    // Arsipkan sumber lama, jangan hapus registry lama.
    fs.mkdirSync(backupDir, { recursive: true });

    fs.copyFileSync(
      REGISTRY_PATH,
      path.join(backupDir, "materials-registry.json")
    );

    fs.copyFileSync(
      CLASSES_PATH,
      path.join(backupDir, "classes.json")
    );

    // Tulis data baru.
    for (const file of files) {
      writeNewJson(file.path, file.data);
    }

    summary.backupDirectory =
      path.relative(ROOT, backupDir);
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const reportName = `migration-${Date.now()}.json`;
  const reportPath = path.join(REPORT_DIR, reportName);

  // Laporan migrasi juga dibuat tanpa menimpa laporan lama.
  writeNewJson(reportPath, summary);

  console.log("\n=== COURSE JSON MIGRATION ===");
  console.log("Mode:", summary.mode);
  console.log("Mata kuliah:", summary.totalCourses);
  console.log("Posting materi:", totalMaterials);
  console.log("Lampiran:", totalAttachments);
  console.log("Lampiran terverifikasi:", verifiedAttachments);
  console.log("Lampiran belum terverifikasi:", unverifiedAttachments);
  console.log("File output:", files.length);
  console.log("Laporan:", reportPath);

  if (!APPLY) {
    console.log("\nSIMULASI SELESAI.");
    console.log("Belum ada data registry yang diubah.");
    console.log("Jalankan dengan --apply jika hasil sudah benar.");
  } else {
    console.log("\nMIGRASI SELESAI.");
    console.log("Backup:", path.join(DATA, "legacy-backup"));
  }
}

try {
  main();
} catch (error) {
  console.error("\nMIGRATION ERROR:", error.message);
  process.exitCode = 1;
}
