# Development History

## Project Overview

Hermes-Edlink is a local worker developed to monitor and index course materials published on EdLink.

The initial development focuses on local execution and validation. Integration with Hermes and OpenRouter is planned for a later stage.

## Phase 1 Scope

- Monitor materials and lecture uploads across seven Academic classes.
- Use EdLink notifications as the primary detection signal.
- Use class material scans only for verification and backup.
- Accept only the activity label `menambahkan materi pada`.
- Store metadata using the existing per-course JSON structure.
- Match new scan results against existing metadata to prevent duplicate records.

The following LMS activities are explicitly outside Phase 1 scope:

- Assignments and tasks.
- Quizzes and examinations.
- Attendance.
- Grades.
- Discussions and other LMS activities.

## Existing Dataset

The preserved baseline dataset contains 39 materials and 51 attachments.
The existing per-course JSON structure is retained.

## Browser Automation

The project uses Playwright with a dedicated Chrome profile and Chrome DevTools Protocol connection.
The dedicated profile is intended to isolate the worker session from other Chrome profiles.

Runtime configuration is centralized in `scripts/runtime-config.js`.

## Development and Experiments

Development included dashboard inspection, notification inspection, material structure inspection, identifier matching, duplicate metadata inspection, and controlled download experiments.

An early dashboard inspection encountered a URL construction error:

```text
TypeError: Failed to construct URL: Invalid URL
```

The inspection subsequently completed successfully.

Historical experiments are retained under `experiments/`.
Maintenance scripts and historical backups are retained under `archive/`.

## Current Script Organization

- `worker.js` — worker entry point.
- `browser-manager.js` — browser and session management.
- `runtime-config.js` — shared runtime configuration.
- `scan-material-notifications.js` — notification scanning.
- `scan-all-classes.js` — class material verification scan.
- `update-course-materials.js` — course material metadata updates.

## Future Direction

Hermes and OpenRouter integration may be considered after the local worker has been validated.
Such integration must preserve the Phase 1 scope unless a separate scope decision is made.
