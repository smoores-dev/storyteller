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

## Manual Setup

If you prefer to manage your environment yourself, install the following
dependencies globally. You must use the specified versions to avoid
compatibility issues.

- **[Git LFS](https://git-lfs.com/)**: Required for handling large media assets.
  Make sure to run `git lfs pull` in the repo.
- **Node.js**: Version 24.x
- **Build Tools**: `gcc`, `ffmpeg`, `yarn`, `sqlite`
