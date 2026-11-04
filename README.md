# Hermes-Edlink

![Version](https://img.shields.io/badge/version-v1.0.0-blue)
![Status](https://img.shields.io/badge/status-active-brightgreen)
![Validation](https://img.shields.io/badge/end--to--end%20validation-pending-orange)
![Platform](https://img.shields.io/badge/platform-Windows-0078D6)
![Node.js](https://img.shields.io/badge/node-24%20(tested)-339933)
![License](https://img.shields.io/badge/license-MIT-yellow)

Hermes-Edlink is a local worker that watches EdLink for new lecture materials and records them in per-course JSON files. EdLink is the learning management system of Universitas Widyatama.

This repository contains v1, which detects and indexes materials. It does not download attachments or read document contents. Later versions are described in the [roadmap](#roadmap).

## Table of contents

- [Status](#status)
- [Roadmap](#roadmap)
- [How v1 works](#how-v1-works)
  - [Detection rules](#detection-rules)
  - [Worker cycle](#worker-cycle)
  - [Runtime topology](#runtime-topology)
  - [Components](#components)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Runtime data](#runtime-data)
- [Usage](#usage)
- [Scheduling on Windows](#scheduling-on-windows)
- [Known limitations](#known-limitations)
- [Project structure](#project-structure)
- [Development history](#development-history)
- [Changelog](#changelog)
- [Disclaimer](#disclaimer)
- [License](#license)

## Status

- Current version: v1 (local worker, indexing only).
- The worker runs in apply mode, started every 15 minutes by Windows Task Scheduler.
- End-to-end validation is pending. The worker has run on schedule, but no new material notification has appeared yet. The full path from notification to saved metadata and the processed-notification mark has not been observed on real data.

The badges at the top are static. Update them when the version or status changes.

## Roadmap

| Version | Scope | Runs on | Status |
|---|---|---|---|
| v1 | Detect new materials from EdLink notifications, verify them with a class scan, store metadata and attachment records without duplicates | Local Windows machine | Active, end-to-end validation pending |
| v2 | Integrate the Hermes agent with OpenRouter models. For each new material: read it, look up additional references, write a summary, produce a PDF and send it by email | Local machine | Planned |
| v3 | Full agent that no longer depends on the local device | Not local | Planned |

The scope of v2 and v3 is a working plan and can change. All versions live in this single repository, and releases are recorded in the [changelog](#changelog).

Planned v2 flow:

```mermaid
flowchart LR
    V1["v1 worker<br/>detects a new material"] --> H["Hermes agent<br/>with OpenRouter model"]
    H --> R["Read the material"]
    R --> X["Look up additional references"]
    X --> S["Write a summary"]
    S --> P["Build a PDF"]
    P --> M["Send by email"]
```

## How v1 works

### Detection rules

- EdLink notifications matching the configured pattern (default: `Ada Materi baru @...`) are the trigger. They only decide whether to look further.
- The class scanner decides what counts as a material. Only activities labeled with the configured activity label (default: `menambahkan materi pada`) are included.
- A class scan runs only after a trigger. It verifies the result and is not an independent periodic check. When no new notification appears, the worker finishes without scanning any class.
- Assignments, quizzes, exams, attendance, grades, discussions and other LMS activities are excluded.
- Attachments are not downloaded during normal operation. Only their names and download availability are recorded.

### Worker cycle

```mermaid
flowchart TD
    TS["Windows Task Scheduler<br/>every 15 minutes"] --> W["worker.js"]
    W --> L{"Lock acquired?"}
    L -- "No, another worker is running" --> SK["Skip this cycle"]
    L -- "Yes" --> BM["browser-manager.js<br/>ensure headless Chrome is available"]
    BM --> NS["scan-material-notifications.js<br/>read EdLink notifications"]
    NS --> D{"Unprocessed material<br/>notifications?"}
    D -- "No" --> E1["Finish<br/>class scan skipped"]
    D -- "Yes" --> CS["scan-all-classes.js<br/>scan every configured class"]
    CS --> V{"Scan complete<br/>and valid?"}
    V -- "No" --> E2["Stop with an error<br/>metadata untouched"]
    V -- "Yes" --> U["update-course-materials.js"]
    U --> A{"Mode"}
    A -- "Dry-run (default)" --> R["Report only<br/>notifications stay unprocessed"]
    A -- "Apply" --> S["Write per-course metadata<br/>mark notifications as processed"]
```

If the notification scanner finds a login page, it stops without processing anything and reports that the EdLink session has expired.

### Runtime topology

```mermaid
flowchart LR
    subgraph LOCAL["Local Windows machine"]
        W["worker.js"] --> BM["browser-manager.js"]
        BM --> C["Headless Chrome<br/>dedicated profile, CDP port"]
        W --> NS["Notification scan"]
        W --> CS["Class scan"]
        W --> U["Course updater"]
        NS --> C
        CS --> C
        NS --> D[("Local runtime data<br/>data, logs, temp")]
        CS --> D
        U --> D
        W --> D
    end
    C <--> E["EdLink"]
```

### Components

| File | Role |
|---|---|
| `scripts/worker.js` | Entry point. Takes the lock, runs the other scripts in order, validates the scan, tracks processed notifications and writes the log. |
| `scripts/browser-manager.js` | Starts headless Chrome with a dedicated profile and a remote debugging port if it is not already running. |
| `scripts/runtime-config.js` | Reads settings from environment variables and provides defaults. |
| `scripts/scan-material-notifications.js` | Connects to Chrome over CDP, checks that the session is logged in and reads material notifications. It does not click or delete notifications. |
| `scripts/scan-all-classes.js` | Opens each configured class and reads material activities, titles, session information and attachment names. |
| `scripts/update-course-materials.js` | Compares scan results with the existing per-course data, using stable IDs to avoid duplicates. Runs as a dry run unless `--apply` is given. Creates a backup before writing. |

## Requirements

- Windows. v1 was developed and operated on Windows. The Node scripts may run elsewhere, but that has not been tested.
- Node.js and npm.
- Google Chrome.
- An EdLink account whose session is already logged in inside a dedicated Chrome profile.
- Local runtime data, described under [Runtime data](#runtime-data).

## Installation

```powershell
npm ci
```

## Configuration

Settings are read from environment variables.

| Variable | Purpose | Default |
|---|---|---|
| `CHROME_PATH` | Chrome executable | `chrome.exe` under Program Files on Windows, `google-chrome` elsewhere |
| `EDLINK_PROFILE_DIR` | Dedicated Chrome profile directory | `temp/edlink-profile` inside the project |
| `CDP_HOST` | Chrome DevTools host | `127.0.0.1` |
| `CDP_PORT` | Chrome DevTools port | `9223` |
| `EDLINK_BASE_URL` | EdLink base URL | `https://lms.widyatama.ac.id` |
| `NOTIFICATION_PATTERN` | Regex pattern for material notifications | `Ada Materi baru\\s*@` |
| `MATERIAL_ACTIVITY_LABEL` | Text label for material activities | `menambahkan materi pada` |

## Runtime data

The repository does not contain browser profiles, course data, scan results, logs or generated output. These are created or supplied locally and are excluded by `.gitignore`.

| Path | Content |
|---|---|
| `data/classes.json` | Configured classes. Each entry needs at least `id`, `name` and `url`. |
| `data/courses/<id>-<slug>/` | Per-course `materials.json`, `content-index.json` and `course-info.json`. |
| `data/materials-registry.json` | Legacy registry. The updater requires it to exist but no longer updates it. |
| `data/material-notifications.json` | Latest notification scan result. |
| `data/materials-scan.json` | Latest class scan result. |
| `data/worker-state.json` | Notifications already processed. |
| `data/backups/` | Backups written by the updater before each apply. |
| `logs/worker.log` | Worker log. |
| `temp/worker.lock` | Lock that prevents overlapping runs. |
| `output/reports/` | Generated reports. |

The Chrome profile contains an authenticated session, so treat it like a password. Use a dedicated copy instead of your main profile, keep it outside version control, and do not commit session data, credentials, personal information or private course records.

## Usage

Review the runtime configuration, local data, browser profile and backup strategy before the first run.

The default mode is a dry run for course metadata. It still starts the browser, scans EdLink and can create or update runtime files such as logs, scan results and the lock file, so it is not fully read-only.

```powershell
node scripts/worker.js
```

The `--apply` option writes course metadata and worker state. Use it after reviewing a dry-run report and backing up the local data.

```powershell
node scripts/worker.js --apply
```

Do not run either mode against an active production environment without checking its effects and isolating the runtime data first.

## Scheduling on Windows

v1 was scheduled with a task named `Hermes-Edlink-Worker` using these settings.

| Setting | Value |
|---|---|
| Program | Full path to `node.exe` |
| Arguments | `"<project>\scripts\worker.js" --apply` |
| Start in | The project root |
| Trigger | Repeat every 15 minutes |
| Hidden | Yes |
| If the task is already running | Do not start a new instance (`IgnoreNew`) |
| Missed runs | Start as soon as possible (`StartWhenAvailable`) |
| Execution time limit | 30 minutes |
| Account | The signed-in Windows user |

Daily operation needs the computer to stay on and out of sleep or hibernation, an internet connection, a signed-in Windows account, and the headless Chrome process left running.

## Known limitations

- The worker expects exactly seven classes in `data/classes.json` and stops otherwise. A different number of classes requires editing `scripts/worker.js`.
- The updater only updates course folders that already exist. Creating the initial data for a new class or semester is not part of the worker.
- Notification identity is based on class name and material title only. This ensures stability across multiple runs regardless of UI text formatting changes.
- Failures, including an expired EdLink session, are written to `logs/worker.log` only. No alert is sent.
- The worker runs on one machine and does not run while that machine sleeps or is off.
- End-to-end validation on a real new-material notification is still pending.

## Project structure

```text
.
├── scripts/       worker, browser manager, scanners and metadata updater
├── experiments/   historical inspection and test scripts
├── archive/       historical backups and one-time maintenance scripts
├── LICENSE
├── package.json
└── README.md
```

## Development history

v1 was built and activated on 2 and 3 November 2026 with a focus on local execution and validation. Integration with Hermes and OpenRouter is planned for v2.

Scope: monitor lecture materials across seven classes, use notifications as the main signal and class scans for verification, store metadata in the existing per-course structure, prevent duplicates, and run every 15 minutes. Assignments, quizzes, exams, attendance, grades, discussions, attachment downloads, document processing and email delivery are out of scope for v1.

Baseline dataset after the first scan and apply:

| Item | Count |
|---|---|
| Classes | 7 |
| Materials | 39 |
| Attachments | 51 |
| Missing attachment metadata after audit | 0 |

<details>
<summary>Work log</summary>

1. Environment: Windows, PowerShell 7, Node.js 24, npm, Python 3.12, Playwright and Google Chrome 156. The project uses CommonJS.
2. Browser: a dedicated Chrome profile keeps the worker session separate from the main profile. Playwright connects through the DevTools protocol on port 9223. The dashboard was inspected to learn the structure of the class pages.
3. Profile backup: the dedicated profile was copied and the copy is used for headless operation. The copy matched the source in file count and size, headless Chrome opened EdLink with a valid session, and there was no redirect to the login page. The original profile is not used for headless runs.
4. Class list: seven Academic classes were configured.
5. Baseline scan: `scan-all-classes.js` opened each class, filtered activities by the configured material activity label, and read titles, session information, attachment names and download availability without downloading anything.
6. Metadata: the existing per-course structure was kept. `update-course-materials.js` matches scan results to existing records by stable ID, preserves attachment metadata and backs up before any change. It has a dry-run mode and an apply mode. The earlier migration was completed and is not repeated. The worker no longer updates the legacy registry.
7. Audit: after the first apply, every course file was checked. No attachment metadata was missing, and existing content indexes and hashes were kept.
8. Notification scanner: `scan-material-notifications.js` connects over CDP, checks for a login page and reads notifications matching the configured pattern. It does not click or delete notifications.
9. Browser manager: `browser-manager.js` starts headless Chrome with the operational profile if it is not running and checks the CDP connection. Chrome runs as a background process, not as a Windows service.
10. Worker: `worker.js` combines the steps with a lock file, a state file, a log and the dry-run and apply modes. Notifications are marked as processed only after the apply-mode updater succeeds.
11. Dry-run testing: several dry runs finished without errors. With no new notifications, the class scan was skipped as designed.
12. Scheduling: a Task Scheduler task runs the worker every 15 minutes. It first ran in dry-run mode and returned result code 0.
13. Apply mode: after repeated successful dry runs the task was switched to apply mode and started manually. It returned result code 0, and the log showed no material notifications and no class scan.

</details>

## Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Version 1.x corresponds to v1, 2.x to v2 and 3.x to v3.

### [1.0.0] - 2026-11-03

First public release of the v1 local worker.

Added:

- Worker that runs a full cycle with a lock file, a state file and a log, in dry-run or apply mode.
- Notification scanner for EdLink notifications matching the configured pattern.
- Class scanner for material activities labeled with the configured activity label, without downloading attachments.
- Course updater that matches scan results to existing records by stable ID, backs up before writing and stores per-course metadata.
- Browser manager that starts headless Chrome with a dedicated profile over the DevTools protocol.
- Runtime configuration through environment variables.

Notes:

- End-to-end validation on a real new-material notification is pending.

## Disclaimer

This is an independent personal project.

## License

MIT. See [LICENSE](LICENSE).
