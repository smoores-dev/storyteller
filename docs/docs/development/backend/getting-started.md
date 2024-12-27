---
sidebar_position: 1
---

# Getting started

## Setting up a local development environment

Storyteller's backend is primarily a Next.js server. It's written in Typescript,
and relies on some additional libraries that are worth getting up to speed on:

- [sqlite](https://www.sqlite.org/) is the database, and we use
  [better-sqlite](https://www.npmjs.com/package/better-sqlite3) as the driver
- [piscina](https://piscinajs.github.io/piscina/) is the worker distribution
  manager for running the synchronization processing on a separate worker thread
- [echogarden](https://github.com/echogarden-project/echogarden) is the speech
  toolset that we use for transcription

### Development tools

Before cloning the repo, be sure to install and configure
[Git LFS](https://git-lfs.com/). If you've already cloned the repo, after you
install Git LFS, make sure to run `git lfs pull` in the repo. This will pull the
test fixtures from GitLab's Large File System storage, without which the tests
will not run.

In order to get started with the backend development, you'll need to have `gcc`,
`ffmpeg`, `node.js` (v20.x), `yarn`, and `sqlite` installed. You can either
install these with your operating system's package manager, or you can use the
Nix flake provided in this project (`nix develop .`), which includes all of
these tools.

## Installing dependencies

Once you have your development environment set up, you'll need to install
dependencies. This repo uses Yarn for Node.js package management. This will be
available after following the development environment setup flow.

To install Node.js dependencies, run:

```shell
yarn install
```

## Running the development server

The following command will run the dev server, using the project root as the
"data directory" (where `assets` and the sqlite db file will live):

```shell
STORYTELLER_DATA_DIR=$(pwd) yarn dev:web
```

This will run the web server on port 8001. You should be able to see it in your
browser at [http://localhost:8001](http://localhost:8001).

To run the docs server, run:

```shell
yarn dev:docs
```

This will run the docs server on port 3000. You should be able to see it in your
browser at [http://localhost:3000](http://localhost:3000).
