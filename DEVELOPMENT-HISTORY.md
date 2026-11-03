# Development history

This document records how v1 of Hermes-Edlink was built. For the current state of the project, see the [README](../README.md).

## Overview

Hermes-Edlink is a local worker that monitors and indexes course materials published on EdLink. v1 was built and activated on 2 and 3 November 2026. It focuses on local execution and validation. Integration with Hermes and OpenRouter is planned for v2.

## v1 scope

Included:

- Monitor lecture materials across seven classes.
- Use EdLink notifications as the main detection signal.
- Use class scans for verification and backup.
- Accept only activities labeled `menambahkan materi pada`.
- Store metadata and attachment records in the existing per-course JSON structure.
- Match scan results against existing metadata to prevent duplicates.
- Run automatically every 15 minutes.

Excluded:

- Assignments and tasks, quizzes, exams, attendance, grades and discussions.
- Attachment downloads in the normal worker.
- Processing of document contents.
- Hermes, OpenRouter and email delivery.

## Work log

1. Environment. Windows, PowerShell 7, Node.js 24, npm, Python 3.12, Playwright and Google Chrome 156. The project uses CommonJS.
2. Browser. A dedicated Chrome profile keeps the worker session separate from the main profile. Playwright connects to Chrome through the DevTools protocol on port 9223. The dashboard was inspected to learn the structure of the class pages.
3. Profile backup. The dedicated profile was copied and the copy was used for headless operation. The copy matched the source in file count and size. Headless Chrome opened EdLink with a valid session and no redirect to the login page. The original profile is not used for headless runs.
4. Class list. Seven classes were configured, all in the Academic category.
5. Baseline scan. `scan-all-classes.js` opened each class, filtered activities by the `menambahkan materi pada` label, and read titles, session information, attachment names and download availability without downloading anything.
6. Metadata. The existing per-course structure was kept. `update-course-materials.js` matches scan results to existing records using stable IDs, preserves attachment metadata, writes per-course files and backs up before any change. It has a dry-run mode and an apply mode. The earlier migration was completed and is not repeated. The legacy registry is no longer updated by the worker.
7. Metadata audit. After the first apply, every course file was audited. No attachment metadata was missing, and existing content indexes and hashes were kept.
8. Notification scanner. `scan-material-notifications.js` connects over CDP, checks for a login page, reads notifications matching `Ada Materi baru @...`, and extracts the class and material title. It does not click or delete notifications.
9. Browser manager. `browser-manager.js` starts headless Chrome with the operational profile if it is not already running, and checks the CDP connection. Chrome runs as a background process, not as a Windows service.
10. Worker. `worker.js` ties the steps together with a lock file, a state file, a log and the dry-run and apply modes. The worker marks notifications as processed only after the apply-mode updater succeeds.
11. Dry-run testing. Several dry runs completed without errors. With no new notifications, the class scan was skipped as designed.
12. Scheduling. A Windows Task Scheduler task was created to run the worker every 15 minutes, hidden, with overlapping runs ignored, missed runs started when available, and a 30-minute time limit. It first ran in dry-run mode and returned result code 0.
13. Apply mode. After repeated successful dry runs the task was switched to apply mode and started manually. The run finished with result code 0. The log showed no material notifications and no scan of the classes.

## Baseline dataset

| Item | Count |
|---|---|
| Classes | 7 |
| Materials | 39 |
| Attachments | 51 |
| Missing attachment metadata after audit | 0 |

## Design clarifications

1. The class scan is not a periodic fallback. When a new notification is detected, the worker scans all classes to verify it. When there is none, the scan is skipped.
2. The two filters have different roles. The notification pattern `Ada Materi baru @...` is the trigger. The `menambahkan materi pada` activity label is the final rule for including a material.
3. End-to-end validation is not complete. No new material notification has appeared since apply mode was enabled. The chain of notification, class verification, metadata update, storage and processed-notification mark is waiting for a real case.

## Status

v1 is active in apply mode and waiting for its first real new-material notification.

## Next

- v2: integrate Hermes with OpenRouter models to read new materials, look up references, write a summary, produce a PDF and send it by email.
- v3: a full agent that no longer runs on the local device.
