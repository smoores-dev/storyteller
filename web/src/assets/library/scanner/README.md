# Library scanner

This directory owns everything between "a file shows up on disk" and "a row in
the books table with manifest, fingerprint, cover, and metadata in sync". This
document describes how the pieces fit together; the code is authoritative if
they disagree.

## Triggers

Three things can start a scan; all of them call `scan()` in `scan.ts`.

| Source      | Entry point                                         | What it scans                                   |
| ----------- | --------------------------------------------------- | ----------------------------------------------- |
| `watcher`   | `triggers/watcher.ts` (via `@parcel/watcher`)       | Files that changed since the last flush         |
| `scheduled` | `triggers/cron.ts` + `triggers/scheduler.ts`        | Full library on a schedule                      |
| `manual`    | `POST /api/v2/books/scan` (or the per-book variant) | One book, the whole library, or an import path  |
| `upload`    | `POST /api/v2/books/upload/...` (tus)               | The just-uploaded book, after the file is moved |
| `api`       | `POST /api/v2/books`                                | The just-created book                           |

Concurrency per source is set in `defaultConcurrency` in `scan.ts`. Only one
scan runs at a time globally (`state.ts` holds an `AsyncMutex`); any later
trigger queues behind the active one.

## Watcher flush model

`triggers/watcher.ts` debounces raw FS events into batches:

1. `@parcel/watcher` fires `create`/`update`/`delete` events.
2. Events pass through `standardFilter` (drop non-epub/non-audio, drop our own
   internal asset paths, drop watchman cookies) and are appended to
   `pendingChanges`.
3. The first event in a batch schedules a 750ms flush. Events arriving inside
   that window pile up but do **not** extend the timer.
4. When the timer fires, `flushChanges` runs the **stability gate** (see below)
   then hands the batch to `scan({ kind: "changed-paths", ... })`.
5. If new events arrive while the scan is running, a follow-up flush is
   scheduled 250ms after the scan finishes.

### Stability gate

Network transfers (SMB, AFP) cause partial writes to land on the watching
machine's local FS while the file is still growing. The scanner used to open
these half-written zips and fail; the file would not be re-queued.

Before each flush, `flushChanges` snapshots `(size, mtimeMs)` for every live
(non-delete) path in the batch, sleeps `STABILITY_RECHECK_MS` (500ms), and
re-snapshots. If anything changed, the events stay in `pendingChanges` and
another flush is scheduled for 750ms later. There is a per-path defer cap of
`STABILITY_MAX_DEFER_MS` (60s) so a slowly-growing file (log, etc.) can't block
the queue forever.

Effect: a 60-second multi-track audiobook transfer produces **one** scan after
the last track lands, not one scan per track.

## Discovery

`../discovery.ts` is the "look at the filesystem, decide what's a book" layer.
It produces `BookPath` records that group related files:

```ts
type BookPath = {
  ebook?: string // .epub classified as plain text
  readaloud?: string // .epub with mediaOverlay (read-along)
  audiobook?: string // directory containing audio tracks
  epubUnknown?: string[] // .epub not yet classified — scanner will inspect
  bookFolder?: string // the directory holding the above files
}
```

Two callers produce BookPaths:

- `discoverBookPathsForRoots(...)` — a recursive walk of a watched root. Used by
  `import-path` tasks (initial scan, manual rescan).
- `buildBookPathsFromChanges(...)` — works from watcher change buckets, doing at
  most one non-recursive `readdir` per affected folder. Used by `changed-paths`
  tasks.

Both enforce the **one-book-per-folder** rule: at most 1 ebook + 1 readaloud

- 1 audiobook per folder. If more than 2 epubs share a folder, or more than 1
  audiobook directory does, the offending folder is logged with `logger.warn`
  and excluded from import — the user is expected to reorganize.

## Reconcile

`../reconcile.ts` decides whether each `BookPath` maps to an existing book or
becomes a new one. It tries matching in this order:

1. **`findMatchingBook`** — exact path equality against any stored format
   (`ebook`, `readaloud`, `audiobook`).
2. **`findMatchingBookByRealpath`** — canonicalize candidate and stored paths
   via `realpath()` to catch symlinks / bind mounts pointing at the same file.
3. **`findMatchingBookByBookFolder`** — match by `dirname`. If the candidate's
   `bookFolder` equals the parent directory of any stored format path, treat it
   as the same book. Skipped when the bookFolder equals the watched root (flat
   layout, many unrelated books in one folder).
4. **`getBookByAudiobookFilepathPrefix`** — last-ditch DB prefix lookup on
   audiobook filepath only.

If everything misses, `createNewBook` creates a row from the strongest available
metadata (epub > audiobook > minimal record from an unclassified epub).

### Folder-merge: why it exists

Without (3), the watcher race below produces a duplicate:

```
t=0.0s   user drops folder containing book.epub + book.mp3 over SMB
t=0.4s   book.epub finishes copying → "create" event
t=1.2s   flush fires, only book.epub is present → book created with ebook only
t=2.8s   book.mp3 finishes copying → "create" event
t=3.6s   flush fires, sees { audiobook: "watched/book1" } → no match → NEW BOOK
```

With the folder-match step, the second flush sees that the new audiobook's
parent folder equals the existing book's ebook's parent folder and merges them
into one record. The stability gate prevents most of these races upfront; the
folder-match is the fallback for rsync `--partial`, retries after a failed scan,
and any other source that bypasses the gate.

### Conflict handling

Once a candidate is matched, `attachNewRelations` enforces "one of each kind per
folder" by stripping any new relation that conflicts with an existing relation
of the same type (`detectFormatConflicts`). The conflict is logged via
`reconcile.ts` so the user sees what was rejected and why.

## The per-book scanner pipeline

After reconcile decides the set of inputs, `scan.ts` runs each input through the
appropriate pipeline:

- `pipelines/scanEbook.ts` — for ebook and readaloud formats
- `pipelines/scanAudiobook.ts` — for audiobook format

Each pipeline composes a series of steps from `steps/`. The shape of a step is
defined by `defineStep` in `step2.ts` — each step receives a typed input, a
`ScanCtx`, and either returns a narrower output type or returns `null` to
short-circuit. The current order (ebook example):

1. `check-exists` — mark missing if the file is gone
2. `check-fingerprint` — hash; skip downstream work if unchanged and not `force`
3. `open-epub` — open the zip (catches EpubVersionError → upgrade path)
4. `upgrade-epub` — auto-upgrade EPUB 2 if settings allow
5. `extract-manifest` — load the spine + mediaOverlay info
6. `determine-format` — confirm ebook vs readaloud
7. `extract-metadata` — title/author/etc. from the OPF
8. `reconcile-metadata` — write manifest, fingerprint, pageCount, fileSize,
   isEpub2 onto the format relation (and apply field overrides for the book)
9. `extract-covers` — cache the cover image

All step output goes through `ScanReport` (`scanReport.ts`), which aggregates
per-step timings, skips-by-reason, and failures into the summary logged at the
end of each scan.

## Locking

There is **one** scanner-wide mutex (`state.ts`, `withScanLock`). Triggers that
fire while a scan is active queue their source via `pendingSources` and wait.
Inside a scan, the per-book/per-format work runs with `concurrency` workers
(default 1 for `watcher`/`upload`, 2 otherwise) — those workers do not contend
with each other beyond DB connection pool limits.

Uploads also acquire the mutex via `scanBooks({ source: "upload", ... })` after
the file is moved into internal storage; this means an upload finishes before
its scan completes, but it ensures the upload's response includes the
fully-reconciled book.

## Adding a new step

1. Add a file under `steps/your-step.ts`. Export a step built with
   `defineStep(stepName, async (input, ctx) => { ... })`.
2. Add the step to the appropriate pipeline in `pipelines/`. The input type of
   your step must match the output type of the previous step.
3. If the step writes to the DB, get the current book via `getBook(uuid)` inside
   the step rather than trusting `input.book` — earlier steps may have mutated
   it.
4. Use `ctx.report.skipped` / `ctx.report.warn` / `ctx.report.failed` for
   per-book outcomes; use `ctx.logger.debug` for tracing.
5. If your step needs a disposable resource (an open file, etc.), register it on
   `ctx.scope` (`AsyncDisposableStack`) so it's cleaned up when the pipeline
   finishes.

## File map

```
scanner/
  ctx.ts                — ScanCtx, ScanSource, ScanOptions
  scan.ts               — scan(), scanLibrary(), scanBooks(), task resolution
  scanReport.ts         — per-scan outcome aggregator
  state.ts              — global scan mutex, recent-reports buffer
  step2.ts              — defineStep + ScanAbortedError
  formatRelations.ts    — helpers for building format-relation update objects
  manifestValue.ts      — manifest type narrowing
  types.ts              — ScanInput, ScanFormat, narrowing types (EpubOpened
                          → MetadataExtracted → ManifestReady → Reconciled)
  watcher-snapshot.ts   — on-disk snapshot for watcher cold start
  write-intent.ts       — coordination so the scanner doesn't react to its
                          own writes
  pipelines/            — per-format pipelines
  steps/                — individual steps
  triggers/             — watcher / cron / scheduler
```
