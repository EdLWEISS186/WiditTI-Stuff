# Changelog

All notable changes to this project are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Version 1.x corresponds to v1, 2.x to v2 and 3.x to v3.

## [Unreleased]

### Planned

- v2: Hermes agent with OpenRouter models that reads new materials, looks up references, writes a summary, produces a PDF and sends it by email.
- v3: full agent that no longer runs on the local device.

## [1.0.0] - 2026-11-03

First public release of the v1 local worker.

### Added

- Worker that runs a full cycle with a lock file, a state file and a log, in dry-run or apply mode.
- Notification scanner that reads EdLink notifications matching `Ada Materi baru @...`.
- Class scanner that reads material activities labeled `menambahkan materi pada` without downloading attachments.
- Course updater that matches scan results to existing records by stable ID, backs up before writing and stores per-course metadata.
- Browser manager that starts headless Chrome with a dedicated profile over the DevTools protocol.
- Runtime configuration through environment variables.
- Documentation: README with topology diagrams, development history and this changelog.

### Notes

- End-to-end validation on a real new-material notification is pending.
