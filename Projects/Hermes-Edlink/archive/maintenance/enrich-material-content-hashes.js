
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");

const REGISTRY_PATH = path.join(
  ROOT, "data", "materials-registry.json"
);

const COMPARISON_PATH = path.join(
  ROOT, "data", "kimia-duplicate-comparison.json"
);

const CONTENT_INDEX_PATH = path.join(
  ROOT, "data", "content-index.json"
);

const TEMP_DIR = path.resolve(ROOT, "temp");

function normalize(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function hashFile(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex")
    .toUpperCase();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveJson(filePath, data) {
  fs.writeFileSync(
    filePath,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

function makeBackup(filePath) {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

  const backupPath =
    `${filePath}.backup-${timestamp}`;

  fs.copyFileSync(filePath, backupPath);

  return backupPath;
}

function isInsideTemp(filePath) {
  const relative = path.relative(TEMP_DIR, filePath);

  return (
    relative !== "" &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  );
}

function main() {
  if (!fs.existsSync(REGISTRY_PATH)) {
    throw new Error("materials-registry.json tidak ditemukan.");
  }

  if (!fs.existsSync(COMPARISON_PATH)) {
    throw new Error("kimia-duplicate-comparison.json tidak ditemukan.");
  }

  const registry = readJson(REGISTRY_PATH);
  const comparison = readJson(COMPARISON_PATH);

  if (!Array.isArray(comparison) || comparison.length === 0) {
    throw new Error("Data perbandingan kosong atau tidak valid.");
  }

  const now = new Date().toISOString();

  // Validasi semua file dan kecocokan registry sebelum perubahan.
  const verified = [];

  for (const item of comparison) {
    const filePath = path.resolve(item.path);

    if (!isInsideTemp(filePath)) {
      throw new Error(
        `File berada di luar folder temp: ${filePath}`
      );
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`File tidak ditemukan: ${filePath}`);
    }

    const stat = fs.statSync(filePath);

    if (stat.size !== item.size) {
      throw new Error(
        `Ukuran file berubah: ${item.materialTitle}`
      );
    }

    const buffer = fs.readFileSync(filePath);

    if (buffer.subarray(0, 5).toString() !== "%PDF-") {
      throw new Error(
        `File bukan PDF valid: ${item.materialTitle}`
      );
    }

    const actualHash = hashFile(filePath);

    if (actualHash !== item.sha256.toUpperCase()) {
      throw new Error(
        `Hash tidak cocok dengan laporan: ${item.materialTitle}`
      );
    }

    const matches = Object.values(registry.attachments).filter(
      attachment =>
        normalize(attachment.className) === normalize(item.className) &&
        normalize(attachment.materialTitle) === normalize(item.materialTitle) &&
        normalize(attachment.filename) === normalize(item.filename)
    );

    if (matches.length !== 1) {
      throw new Error(
        `Harus ada tepat satu lampiran registry untuk ${item.materialTitle}; ditemukan ${matches.length}.`
      );
    }

    verified.push({
      attachment: matches[0],
      item,
      hash: actualHash,
      size: stat.size
    });
  }

  // Pastikan tidak ada dua hasil yang menargetkan lampiran sama.
  const targetIds = verified.map(x => x.attachment.id);

  if (new Set(targetIds).size !== targetIds.length) {
    throw new Error(
      "Ada lampiran registry yang ditargetkan lebih dari sekali."
    );
  }

  const backupPath = makeBackup(REGISTRY_PATH);

  // Terapkan hash ke setiap lampiran yang sudah diverifikasi.
  for (const entry of verified) {
    const attachment = entry.attachment;

    attachment.contentHash = entry.hash;
    attachment.contentHashAlgorithm = "SHA-256";
    attachment.contentSize = entry.size;
    attachment.contentVerification = "byte-identical";
    attachment.contentVerifiedAt = now;
  }

  // Buat indeks berdasarkan hash konten.
  const groups = {};

  for (const attachment of Object.values(registry.attachments)) {
    if (!attachment.contentHash) continue;

    const contentHash = attachment.contentHash;

    if (!groups[contentHash]) {
      groups[contentHash] = {
        contentHash,
        algorithm: "SHA-256",
        contentSize: attachment.contentSize,
        attachmentIds: [],
        occurrences: []
      };
    }

    groups[contentHash].attachmentIds.push(attachment.id);

    groups[contentHash].occurrences.push({
      attachmentId: attachment.id,
      classId: attachment.classId,
      className: attachment.className,
      materialTitle: attachment.materialTitle,
      filename: attachment.filename
    });
  }

  const contentIndex = {
    version: 1,
    updatedAt: now,
    totalVerifiedAttachments: verified.length,
    uniqueContents: Object.keys(groups).length,
    contents: groups
  };

  saveJson(REGISTRY_PATH, registry);
  saveJson(CONTENT_INDEX_PATH, contentIndex);

  console.log("\n=== CONTENT HASH ENRICHMENT ===");
  console.log("File diverifikasi:", verified.length);
  console.log("Lampiran diperbarui:", verified.length);
  console.log("Konten unik terverifikasi:", Object.keys(groups).length);
  console.log("Backup registry:", backupPath);
  console.log("Registry:", REGISTRY_PATH);
  console.log("Content index:", CONTENT_INDEX_PATH);

  console.log("\nHasil verifikasi:");

  for (const entry of verified) {
    console.log(
      `${entry.item.materialTitle} -> ${entry.hash}`
    );
  }
}

try {
  main();
} catch (error) {
  console.error("\nCONTENT HASH ERROR:", error.message);
  process.exitCode = 1;
}
