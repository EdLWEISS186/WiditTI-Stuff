# Hermes-Edlink

A local worker for monitoring and indexing course materials published on EdLink.

## Project Scope

- Monitor course materials and lecture uploads across seven Academic classes.
- Use EdLink notifications as the primary detection signal.
- Use per-class material scans for verification and backup.
- Include only activities labeled `menambahkan materi pada`.
- Maintain per-course metadata and prevent duplicate records.
- Exclude assignments, tasks, quizzes, exams, attendance, grades, discussions, and other LMS activities.

## Requirements

- Node.js and npm
- Google Chrome
- An authenticated EdLink browser session
- Local runtime data and course metadata

## Installation

Install the declared project dependencies:

```powershell
npm ci
```

## Configuration

Runtime settings can be supplied through environment variables:

- `CHROME_PATH` — Chrome executable path.
- `EDLINK_PROFILE_DIR` — dedicated browser profile directory.
- `CDP_HOST` — Chrome DevTools host.
- `CDP_PORT` — Chrome DevTools port.
- `EDLINK_BASE_URL` — EdLink base URL.

The default EdLink base URL is `https://lms.widyatama.ac.id`.

## Runtime Data

The public repository does not include authenticated browser profiles, local course data, scan results, logs, or generated output.
These files must be supplied locally before the worker can operate.
Do not commit session data, credentials, personal information, or private course records.

## Execution and Safety

Review the runtime configuration, local data, browser profile, and backup strategy before starting the worker.

The default worker mode is a dry run with respect to course metadata updates. However, it still connects to the browser, scans EdLink, and may create or update runtime files such as logs, scan results, and lock files. It is not a fully read-only operation.

The `--apply` option enables persistent course metadata and worker-state updates. Use it only after reviewing the dry-run report and confirming that the local data is backed up.

```powershell
node scripts/worker.js
```

To apply reviewed updates:

```powershell
node scripts/worker.js --apply
```

Do not run either mode against an active production environment without first reviewing its effects and isolating the runtime data.

## Project Structure

- `scripts/` — core worker, browser management, scanning, and metadata update scripts.
- `experiments/` — historical inspection and testing scripts.
- `archive/` — historical backups and maintenance scripts.
- `docs/` — project documentation.
- `examples/` — example files.

## Development History

See [Development History](docs/DEVELOPMENT-HISTORY.md) for the project development record.

## License

MIT. See the repository root `LICENSE` file.
