---
sidebar_position: 1
---

# Getting started

## Setting up a local development environment

Storyteller's backend is primarily a Next.js server. It uses
[pymport](https://github.com/mmomtchev/pymport) to run some Python code, namely
`whisperx` and `fuzzysearch`.

Due to the challenges with making the necessary libraries available to pymport,
development should be done in the provided
[development container](https://containers.dev/). If you use VS Code, this is as
simple as installing the Dev Containers extension, and selecting "Rebuild and
reopen in container" from the command prompt.

Otherwise, you may wish to use a standalone dev container runtime, such as
[open dev container](https://gitlab.com/smoores/open-devcontainer) or the
[Dev Container CLI](https://github.com/devcontainers/cli).

### Developing with Dev Containers

To use the development container in this repo, first ensure that you have
[Docker installed](https://docs.docker.com/get-docker/) on your system, and the
Docker daemon is running.

If you do not use VS Code for development, you can use the devcontainer CLI to
start the container with `devcontainer up`. `devcontainer exec` will allow you
to execute commands in the container, including starting a shell session.

## Installing dependencies

Once you have your development environment set up, you'll need to install
dependencies. This repo uses Yarn for Node.js package management. This will be
available after following the development environment setup flow.

To install Node.js dependencies, run:

```shell
yarn deps
```

:::info

Note that running the standard `yarn install` command is insufficient for
properly installing and setting up this project's dependencies. We need to
rebuild a few packages from source, as well as manually modifying pymport to
prevent hard crashes when a user cancels an in-progress processing task.

:::

## Running the development server

The following command will run the dev server:

```shell
yarn dev:web
```

This will run the web server on port 8001. You should be able to see it in your
browser at [http://localhost:8001](http://localhost:8001).

To run the docs server, run:

```shell
yarn dev:docs
```

This will run the docs server on port 3000. You should be able to see it in your
browser at [http://localhost:3000](http://localhost:3000).
