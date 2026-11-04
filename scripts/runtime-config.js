const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const CHROME_PATH =
    process.env.CHROME_PATH ||
    (process.platform === "win32"
        ? path.join(
            process.env.PROGRAMFILES || "C:\\Program Files",
            "Google",
            "Chrome",
            "Application",
            "chrome.exe"
        )
        : "google-chrome");

const PROFILE_DIR =
    process.env.EDLINK_PROFILE_DIR ||
    path.join(ROOT, "temp", "edlink-profile");

const CDP_HOST = process.env.CDP_HOST || "127.0.0.1";
const CDP_PORT = Number(process.env.CDP_PORT || 9223);
const CDP_URL = `http://${CDP_HOST}:${CDP_PORT}`;
const CDP_VERSION_URL = `${CDP_URL}/json/version`;

const EDLINK_BASE_URL =
    process.env.EDLINK_BASE_URL || "https://lms.widyatama.ac.id";

const NOTIFICATION_PATTERN =
    process.env.NOTIFICATION_PATTERN || "Ada Materi baru\\s*@";

const MATERIAL_ACTIVITY_LABEL =
    process.env.MATERIAL_ACTIVITY_LABEL || "menambahkan materi pada";

module.exports = {
    ROOT,
    CHROME_PATH,
    PROFILE_DIR,
    CDP_HOST,
    CDP_PORT,
    CDP_URL,
    CDP_VERSION_URL,
    EDLINK_BASE_URL,
    NOTIFICATION_PATTERN,
    MATERIAL_ACTIVITY_LABEL
};
