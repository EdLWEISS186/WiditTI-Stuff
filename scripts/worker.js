const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");
const SCRIPTS = __dirname;

const CLASSES_PATH = path.join(DATA, "classes.json");
const NOTIFICATIONS_PATH = path.join(DATA, "material-notifications.json");
const SCAN_PATH = path.join(DATA, "materials-scan.json");
const STATE_PATH = path.join(DATA, "worker-state.json");

const LOG_DIR = path.join(ROOT, "logs");
const LOG_PATH = path.join(LOG_DIR, "worker.log");
const LOCK_PATH = path.join(ROOT, "temp", "worker.lock");

const NODE = process.execPath;
const MAX_STORED_NOTIFICATIONS = 2000;
const APPLY_MODE = process.argv.slice(2).includes("--apply");

let lockOwned = false;

function log(message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    console.log(line);
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_PATH, line + "\n", "utf8");
}

function readJson(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File tidak ditemukan: ${filePath}`);
    }

    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalize(value) {
    return String(value || "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
}

function notificationKey(item) {
    const identity = [
        normalize(item.className),
        normalize(item.materialTitle),
        normalize(item.relativeTime)
    ].join("|");

    return crypto
        .createHash("sha256")
        .update(identity)
        .digest("hex");
}

function loadState() {
    if (!fs.existsSync(STATE_PATH)) {
        return {
            version: 1,
            updatedAt: null,
            processedNotifications: {}
        };
    }

    const state = readJson(STATE_PATH);

    if (
        !state.processedNotifications ||
        typeof state.processedNotifications !== "object" ||
        Array.isArray(state.processedNotifications)
    ) {
        throw new Error("Struktur worker-state.json tidak valid.");
    }

    return state;
}

function saveState(state) {
    state.updatedAt = new Date().toISOString();

    const tempPath = `${STATE_PATH}.tmp-${process.pid}`;

    fs.writeFileSync(
        tempPath,
        JSON.stringify(state, null, 2),
        { encoding: "utf8", flag: "wx" }
    );

    try {
        fs.renameSync(tempPath, STATE_PATH);
    } catch (error) {
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
        throw error;
    }
}

function acquireLock() {
    fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });

    try {
        const fd = fs.openSync(LOCK_PATH, "wx");

        fs.writeFileSync(
            fd,
            JSON.stringify({
                pid: process.pid,
                startedAt: new Date().toISOString()
            }, null, 2)
        );

        fs.closeSync(fd);
        lockOwned = true;
        return true;
    } catch (error) {
        if (error.code !== "EEXIST") throw error;
    }

    let existing;

    try {
        existing = readJson(LOCK_PATH);
    } catch {
        throw new Error(
            "Worker lock sudah ada tetapi tidak valid. Periksa temp/worker.lock secara manual."
        );
    }

    const pid = Number(existing.pid);

    if (!Number.isInteger(pid) || pid <= 0) {
        throw new Error("PID pada worker lock tidak valid.");
    }

    try {
        process.kill(pid, 0);
        log(`Worker lain masih berjalan (PID ${pid}). Siklus ini dilewati.`);
        return false;
    } catch (error) {
        if (error.code !== "ESRCH") {
            throw new Error(
                `Tidak dapat memastikan status worker dengan PID ${pid}: ${error.message}`
            );
        }
    }

    log(`Lock lama ditemukan untuk PID ${pid}; membersihkan lock yang stale.`);
    fs.unlinkSync(LOCK_PATH);

    const fd = fs.openSync(LOCK_PATH, "wx");
    fs.writeFileSync(
        fd,
        JSON.stringify({
            pid: process.pid,
            startedAt: new Date().toISOString()
        }, null, 2)
    );
    fs.closeSync(fd);

    lockOwned = true;
    return true;
}

function releaseLock() {
    if (!lockOwned || !fs.existsSync(LOCK_PATH)) return;

    try {
        const lock = readJson(LOCK_PATH);

        if (Number(lock.pid) === process.pid) {
            fs.unlinkSync(LOCK_PATH);
        }
    } catch (error) {
        log(`PERINGATAN: lock tidak dapat dibersihkan: ${error.message}`);
    }

    lockOwned = false;
}

function runNodeScript(filename, args = []) {
    const scriptPath = path.join(SCRIPTS, filename);

    if (!fs.existsSync(scriptPath)) {
        throw new Error(`Script tidak ditemukan: ${scriptPath}`);
    }

    log(`Menjalankan ${filename}${args.length ? " " + args.join(" ") : ""}`);

    const result = spawnSync(
        NODE,
        [scriptPath, ...args],
        {
            cwd: ROOT,
            encoding: "utf8",
            windowsHide: true,
            maxBuffer: 20 * 1024 * 1024,
            timeout: 5 * 60 * 1000
        }
    );

    if (result.stdout) {
        process.stdout.write(result.stdout);
        fs.appendFileSync(LOG_PATH, result.stdout, "utf8");
    }

    if (result.stderr) {
        process.stderr.write(result.stderr);
        fs.appendFileSync(LOG_PATH, result.stderr, "utf8");
    }

    if (result.error) {
        throw new Error(
            `Gagal menjalankan ${filename}: ${result.error.message}`
        );
    }

    if (result.status !== 0) {
        throw new Error(
            `${filename} gagal dengan exit code ${result.status}`
        );
    }

    log(`${filename} selesai dengan sukses.`);
}

function validateScan(classes) {
    const scan = readJson(SCAN_PATH);

    const expectedIds = new Set(classes.map(c => String(c.id)));
    const scannedIds = new Set(
        (scan.classes || []).map(c => String(c.classId))
    );

    if (
        scan.totalClasses !== classes.length ||
        scan.successfulClasses !== classes.length ||
        scan.failedClasses !== 0 ||
        !Array.isArray(scan.classes) ||
        scan.classes.length !== classes.length ||
        scannedIds.size !== classes.length ||
        [...expectedIds].some(id => !scannedIds.has(id))
    ) {
        throw new Error(
            "Hasil scan tidak lengkap atau daftar kelas tidak cocok. Updater tidak dijalankan."
        );
    }

    for (const course of scan.classes) {
        if (
            course.error ||
            !Array.isArray(course.materials) ||
            typeof course.materialCount !== "number" ||
            course.materialCount !== course.materials.length
        ) {
            throw new Error(
                `Hasil scan kelas ${course.className || course.classId} tidak valid.`
            );
        }
    }

    return scan;
}

function main() {
    const args = process.argv.slice(2);

    if (args.some(arg => arg !== "--apply")) {
        throw new Error("Argumen tidak dikenal. Gunakan tanpa argumen untuk dry-run atau --apply.");
    }

    log("========== WORKER START ==========");
    log(`Mode: ${APPLY_MODE ? "APPLY" : "DRY-RUN"}`);

    if (!acquireLock()) return;

    try {
        const config = readJson(CLASSES_PATH);
        const classes = config.classes;

        if (!Array.isArray(classes) || classes.length !== 7) {
            throw new Error(
                "Worker mengharapkan tepat 7 kelas Academic pada classes.json."
            );
        }

        const knownClasses = new Map(
            classes.map(c => [normalize(c.name), c])
        );

        // 0. Pastikan Chrome headless tersedia.
        runNodeScript("browser-manager.js");

        // 1. Deteksi notifikasi materi.
        runNodeScript("scan-material-notifications.js");

        const notificationData = readJson(NOTIFICATIONS_PATH);

        if (!Array.isArray(notificationData.notifications)) {
            throw new Error("Format notifikasi tidak valid.");
        }

        const state = loadState();
        const processed = state.processedNotifications;

        // 2. Hanya notifikasi dari 7 kelas Academic yang diproses.
        const relevant = notificationData.notifications.filter(item =>
            knownClasses.has(normalize(item.className)) &&
            normalize(item.materialTitle)
        );

        const fresh = relevant.filter(item =>
            !processed[notificationKey(item)]
        );

        log(`Notifikasi materi terbaca: ${notificationData.notifications.length}`);
        log(`Notifikasi dari 7 kelas Academic: ${relevant.length}`);
        log(`Notifikasi yang belum diproses: ${fresh.length}`);

        if (fresh.length === 0) {
            log("Tidak ada notifikasi materi baru. Scan kelas dilewati.");
            return;
        }

        for (const item of fresh) {
            log(
                `Kandidat materi baru: ${item.className} | ${item.materialTitle} | ${item.relativeTime}`
            );
        }

        // 3. Verifikasi melalui scanner seluruh kelas.
        runNodeScript("scan-all-classes.js");

        const scan = validateScan(classes);

        log(
            `Verifikasi selesai: ${scan.successfulClasses}/${scan.totalClasses} kelas, ${scan.totalMaterials} materi.`
        );

        // 4. Update metadata: dry-run secara default.
        const updaterArgs = APPLY_MODE ? ["--apply"] : [];
        runNodeScript("update-course-materials.js", updaterArgs);

        if (!APPLY_MODE) {
            log("DRY-RUN selesai. Metadata tidak diterapkan.");
            log("Notifikasi tidak ditandai selesai; aman untuk pengujian ulang.");
            return;
        }

        // 5. Tandai notifikasi selesai hanya setelah updater APPLY sukses.
        const processedAt = new Date().toISOString();

        for (const item of fresh) {
            processed[notificationKey(item)] = {
                className: item.className,
                materialTitle: item.materialTitle,
                relativeTime: item.relativeTime,
                processedAt
            };
        }

        const entries = Object.entries(processed)
            .sort((a, b) =>
                String(b[1].processedAt || "").localeCompare(
                    String(a[1].processedAt || "")
                )
            )
            .slice(0, MAX_STORED_NOTIFICATIONS);

        state.processedNotifications = Object.fromEntries(entries);
        saveState(state);

        log(`Notifikasi berhasil ditandai selesai: ${fresh.length}`);
        log("Worker APPLY selesai dengan sukses.");

    } finally {
        releaseLock();
        log("========== WORKER END ==========");
    }
}

try {
    main();
} catch (error) {
    log(`WORKER ERROR: ${error.stack || error.message}`);
    process.exitCode = 1;
} finally {
    releaseLock();
}
