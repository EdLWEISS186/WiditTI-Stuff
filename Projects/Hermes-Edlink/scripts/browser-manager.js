const fs = require("fs");
const { spawn } = require("child_process");
const http = require("http");

const {
    ROOT,
    CHROME_PATH,
    PROFILE_DIR,
    CDP_PORT,
    CDP_VERSION_URL,
    EDLINK_BASE_URL
} = require("./runtime-config");

function checkCDP() {
    return new Promise(resolve => {
        const req = http.get(CDP_VERSION_URL, res => {
            res.resume();
            resolve(res.statusCode === 200);
        });

        req.setTimeout(2000, () => req.destroy());
        req.on("error", () => resolve(false));
    });
}

async function main() {
    if (await checkCDP()) {
        console.log("Chrome headless sudah aktif.");
        return;
    }

    if (!fs.existsSync(CHROME_PATH)) {
        throw new Error(
            "Chrome tidak ditemukan. Atur environment variable CHROME_PATH."
        );
    }

    if (!fs.existsSync(PROFILE_DIR)) {
        fs.mkdirSync(PROFILE_DIR, { recursive: true });
    }

    const child = spawn(CHROME_PATH, [
        "--headless=new",
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${PROFILE_DIR}`,
        "--no-first-run",
        "--no-default-browser-check",
        `${EDLINK_BASE_URL}/classes`
    ], {
        detached: true,
        stdio: "ignore",
        windowsHide: true
    });

    child.unref();

    for (let i = 0; i < 20; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (await checkCDP()) {
            console.log("Chrome headless berhasil dijalankan.");
            return;
        }
    }

    throw new Error(
        "Chrome headless tidak merespons pada port " + CDP_PORT
    );
}

main().catch(error => {
    console.error("Browser manager gagal:", error.message);
    process.exitCode = 1;
});
