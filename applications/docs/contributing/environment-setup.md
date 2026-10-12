---
title: Environment Setup
---

Prepare your local machine to contribute to the project. You can configure your
environment automatically using Nix (recommended) or manually install the
required dependencies.

## Automatic Setup (Recommended)

We recommend using `devenv` and `direnv` to create an isolated development
environment. This method automatically installs and configures the correct tool
versions when you enter the project directory.

1.  Set up the Nix package manager and `devenv` by following the
    [installation guide](https://devenv.sh/getting-started/#__tabbed_1_3).
2.  Install
    [`direnv`](https://direnv.net/docs/installation.html#from-system-packages)
    and [hook it into your shell](https://direnv.net/docs/hook.html) to enable
    automatic environment switching.

:::tip

Use [Starship](https://starship.rs/guide/) to display your active `devenv`
status directly in your terminal prompt.

:::

### Android

The Android SDK, NDK, and emulator system images add over 20 GB to the
environment, so they are not installed by default. You need them to run
`yarn sim:android` in `applications/mobile`, or to build the Android client in
`applications/clients`. To install them, put the following in
`devenv.local.yaml`:

```yaml
profile: android
nixpkgs:
  allow_unfree: true
```

`nixpkgs.allow_unfree` is required because Google distributes parts of the
Android SDK under non-free licenses. To use the profile once without a config
file, run `devenv --profile android shell`. Building the native Android client
additionally requires a swift.org toolchain with the matching Android SDK
bundle; see `applications/clients/CONTRIBUTING.md`.

## Manual Setup

If you prefer to manage your environment yourself, install the following
dependencies globally. You must use the specified versions to avoid
compatibility issues.

- **[Git LFS](https://git-lfs.com/)**: Required for handling large media assets.
  Make sure to run `git lfs pull` in the repo.
- **Node.js**: Version 24.x
- **Build Tools**: `gcc`, `ffmpeg`, `yarn`, `sqlite`
