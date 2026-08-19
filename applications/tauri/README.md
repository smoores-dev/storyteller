# Storyteller Server (tauri app)

A Tauri shell that bundles a Node runtime plus the Next.js standalone server and
serves the regular Storyteller web app from `http://127.0.0.1:<port>` in a
native window. The runtime layout mirrors the Docker runner stage and
`nix/package.nix`.

## How it works

- `scripts/fetch-binaries.ts` downloads the four sidecar binaries for a target
  triple into `src-tauri/binaries/`: `node` (nodejs.org, checksum-verified),
  `readium` (readium/cli GitHub release, checksum-verified), `ffmpeg` and
  `ffprobe` (static builds: martin-riedl.de on macOS, BtbN on Linux/Windows).
- `scripts/assemble-runtime.ts` builds the web workspace and stages the
  standalone tree (plus workers, migrations, native addons, sqlite uuid
  extension, align prebuild for the target platform) into
  `src-tauri/resources/runtime.tar.gz`. Must run on the platform it targets —
  the tree contains host-compiled native addons.
- The Rust shell extracts the tarball into the per-user app data dir on first
  launch (version-keyed by tarball hash), generates a secret key, picks free
  ports, spawns `node server.js` with the same env the Docker image uses, polls
  `/api/health`, and then navigates the window to the local server. On quit it
  SIGTERMs the server so readium and sqlite shut down cleanly.
- whisper.cpp is not bundled: ghost-story downloads the right variant (CoreML on
  Apple Silicon) on first transcription, same as always.

Server logs land in the app data dir as `server.log`
(`~/Library/Application Support/dev.storyteller-platform.tauri/` on macOS).
Library data lives in `data/` next to it.

## Building

```sh
yarn workspace @storyteller-platform/tauri build
```

That runs fetch-binaries + assemble-runtime (including the full web build) and
then `tauri build`. Artifacts land in `src-tauri/target/release/bundle/`.

After changing only the shell, skip the web rebuild:

```sh
yarn workspace @storyteller-platform/tauri assemble-runtime --skip-build
yarn workspace @storyteller-platform/tauri build:app-only
```

Requires: Rust toolchain, plus the regular web build prerequisites.

## Releasing (CI) and auto-updates

Bumping the `version` in `applications/tauri/package.json` on `main` makes the
`bump-versions` job tag `tauri-v<version>`, which triggers
`.gitlab/ci/publish-tauri.yml`: a macOS job (SaaS Apple Silicon runner, produces
the dmg) and a Linux job (SaaS amd64 runner, produces deb, rpm and AppImage).
The version in `tauri.conf.json` points at `../package.json`, so the
package.json bump is the only one needed. No GitLab Release is created —
artifacts go to the generic package registry under
`storyteller-tauri/<version>/`.

Download URLs (public, no auth):

```
https://gitlab.com/api/v4/projects/67994333/packages/generic/storyteller-tauri/<version>/Storyteller-Server-<version>-aarch64.dmg
https://gitlab.com/api/v4/projects/67994333/packages/generic/storyteller-tauri/<version>/Storyteller-Server-<version>-amd64.deb
https://gitlab.com/api/v4/projects/67994333/packages/generic/storyteller-tauri/<version>/Storyteller-Server-<version>-x86_64.rpm
https://gitlab.com/api/v4/projects/67994333/packages/generic/storyteller-tauri/<version>/Storyteller-Server-<version>-amd64.AppImage
```

### Auto-updates (currently disabled)

The auto-update path is written but switched off until the signing key is set up
in CI: the updater plugin and its startup/menu checks are commented out in
`src-tauri/src/main.rs` (search for "auto-update disabled"), and the CI steps
that build, sign and publish the updater bundle plus the
`storyteller-tauri/latest/latest.json` feed are commented out in
`.gitlab/ci/publish-tauri.yml`.

When enabled, the updater (tauri-plugin-updater) checks the feed on every
release-build launch and via Server → Check for Updates…; updates download the
signed `.app.tar.gz` and restart the app. Stable versions advance `latest.json`,
prereleases (`-alpha.N`, `-beta.N`, …) publish artifacts but never touch it.
Update bundles are signed with a minisign key: the public key is in
`tauri.conf.json`, the private key must be provided to CI as masked variables:

- `TAURI_SIGNING_PRIVATE_KEY` — contents of the private key file (the `_PATH`
  variant is not honored by the bundler)
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — its password (empty if none)

Losing the private key means shipped apps can never accept another update (the
pubkey would have to change, requiring a manual reinstall). Local builds don't
need the key — updater artifacts are only produced in CI via
`--config '{"bundle":{"createUpdaterArtifacts":true}}'`.

## Dev mode

`yarn workspace @storyteller-platform/tauri dev` opens the window against the
next dev server on `localhost:8001` — start `yarn dev:web` first. The boot flow
(extract/spawn) is skipped in debug builds; set `STORYTELLER_TAURI_BOOT=1` to
exercise it.

Useful env overrides for the shell:

- `STORYTELLER_TAURI_SERVER_URL` — attach to an already-running server instead
  of spawning one.
- `STORYTELLER_TAURI_RUNTIME_DIR` — use a pre-extracted runtime tree.
- `STORYTELLER_TAURI_PORT` — pin the server port.

## Configuration

The server port defaults to 8756 (falling back to a random free port). To pin
it, either set `STORYTELLER_TAURI_PORT` or create `tauri.json` in the app data
dir:

```json
{ "port": 12345 }
```

A pinned port that is already taken is a startup error, not a silent fallback.

`tauri.json` also stores the media folder chosen on the first-boot screen (where
library-managed files — synced books, audio, covers — are written):

```json
{ "assetsDir": "/Volumes/Big Disk/Storyteller Media" }
```

It is passed to the server as `STORYTELLER_ASSETS_DIR` and defaults to
`data/assets` inside the app data dir. After first boot it can be changed via
Server → Change Media Folder… (restarts the server) or by editing `tauri.json`
directly. Changing it does not move existing files; move the folder contents
yourself, then use Settings → Data & backups → Rewrite paths to fix absolute
paths stored in the database.

## Title bar

On macOS the window uses `titleBarStyle: "Overlay"` (hidden title): the native
traffic lights float over the web content, and the shell strips fullscreen from
the window's collection behavior so the green button zooms/maximizes. The web
app reserves an in-flow titlebar strip for it: the v3 layout sets `data-tauri` /
`data-window-controls` on `<html>` (SSR from the UA token, plus a pre-paint
inline script for platforms without it), which flips the `--titlebar-h` CSS
variable from `0px` to a real height. The strip is a drag region split across
the sidebar (customize/pin buttons next to the lights) and the content area
(back/forward nav); page headers start below it, so nothing collides with window
controls on any platform. Windows/Linux keep their native chrome for now — going
frameless there later only needs `decorations: false` plus a `WindowControls`
cluster in the strip's right corner (see the anchor in `titlebar-strip.tsx`).

The window background color is still driven by `tauri-titlebar-sync.tsx` (v3
layout), which resolves the `--sidebar` CSS variable and calls the
`set_titlebar_color` command via `@tauri-apps/api`, re-syncing on theme
switches. IPC for the locally served app is granted by the `remote` block in
`capabilities/default.json` (`http://127.0.0.1:*`).

## Navigation

The webview has no browser chrome; the History menu provides Back
(`Cmd/Ctrl+[`), Forward (`Cmd/Ctrl+]`), Reload (`Cmd/Ctrl+R`), and Go to Library
(`Cmd/Ctrl+Shift+H`) so you can always get out of a dead end.

## Server menu

- **Show Server Logs** (`Cmd/Ctrl+Shift+L`) opens `server.log` in the OS default
  viewer; the splash also has a live "Show logs" tail during boot.
- **Restore Database…** stops the server, backs the current database up to
  `data/backups/pre-restore-<stamp>.db`, swaps in a picked `.db` file
  (header-validated), and boots again. First boot offers the same choice ("Start
  fresh" / "Use an existing database…") before the server ever touches a
  database. After a restore the web app detects the moved data dir and offers
  the path-rewrite tool (Settings → Data & backups).

## Tauri detection

The shell sets `STORYTELLER_TAURI=1` on the spawned server, and the splash
reports the webview's default user agent so the shell can append
`StorytellerTauri/<version>` (macOS `customUserAgent`; the browser part is kept
because the reader sniffs `AppleWebKit`). The web app checks either via
`src/isTauriApp.ts`.

## Windows notes

- `sqlite/uuid.c` must be compiled to `uuid.c.dll` before assembly
  (`cl /LD sqlite/uuid.c`); `build-sqlite-ext.sh` only covers macOS/Linux.
- Shutdown uses `taskkill /T /F` (no POSIX signals); whisper/okmain specifics
  are handled on a separate branch.

## Distributing macOS builds

Unsigned builds only run on the machine that built them — on any other Mac the
quarantined download is rejected as "damaged". Recipients can bypass it with
`xattr -cr /Applications/Storyteller.app`, but the real fix is Developer ID
signing + notarization, which requires an Apple Developer Program membership and
a "Developer ID Application" certificate (an "Apple Development" certificate is
not valid for distribution).

With the certificate in the keychain, `tauri build` signs and notarizes
automatically when these env vars are set — no config changes needed
(entitlements are already wired up):

```sh
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
# notarization (either apple id...)
export APPLE_ID="you@example.com"
export APPLE_PASSWORD="app-specific-password"   # appleid.apple.com → app passwords
export APPLE_TEAM_ID="TEAMID"
# ...or an App Store Connect API key instead:
# export APPLE_API_ISSUER=... APPLE_API_KEY=... APPLE_API_KEY_PATH=...
yarn workspace @storyteller-platform/tauri build
```

## Not yet done

- CI jobs per platform, auto-updates, `.epub` file associations.
