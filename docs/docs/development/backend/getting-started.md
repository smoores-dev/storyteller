---
sidebar_position: 1
---

# Getting started

## Setting up a local development environment

Storyteller's backend is made up of two parts:

1. An API server, written in Python, using
   [fastapi](https://fastapi.tiangolo.com/) and
   [whisperx](https://github.com/m-bain/whisperX)
2. A web interface, written in Typescript, using [Next.js](https://nextjs.org/).

There are a few different options for setting up a local development environment
with these tools. Please note that especially the API server can be surprisingly
sensitive to the versions of its dependencies, and so we recommend using one of
the "managed" development environments if possible.

:::info

At this time, the API server can only run on Linux and Windows, and only on
x86/AMD CPU architectures, due to limitations in the current version of the
underlying pytorch dependency used for ML computation. If you'd like to develop
on an Intel macOS machine, you can use the
[devcontainer](#developing-with-dev-containers).

:::

### Developing with Nix

The most reliable way to set up a development environment with all of the
necessary tools for running both backend services is with
[Nix](https://nixos.org/). This repo includes a
[Nix flake](https://zero-to-nix.com/concepts/flakes) that outputs a local
development environment that contains everything needed to develop these
services.

If you don't already have Nix installed, we recommend the
["Quick Start" guide from Determinate System's "Zero-to-Nix"](https://zero-to-nix.com/start/install).
You can install Nix with their Nix installer:

```shell
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install
```

Or visit the link above to see other installation options.

Once you have Nix installed, creating a development environment is as simple as
navigating to the root of the Storyteller repo and running `nix develop`.

:::tip

`nix develop` will default to using the bash shell. If you have a different
preferred shell (e.g. zsh or fish), you can simply pass that shell name to Nix
with the `-c` flag.

For example, to start a Nix development environment with a fish shell:

```shell
nix develop -c fish
```

:::

:::info

The first time that you run `nix develop`, Nix will build all of the necessary
dependencies from source. This can be quite slow, especially for large
dependencies like Python. This will only happen the first time; afterwards,
entering the Nix development environment should be snappy.

:::

### Developing with Dev Containers

There is also a [development container](https://containers.dev) in this repo.
Development containers are more limiting than Nix development environments; you
won't have access to your own shell profile unless you already have a dotfiles
repo set up, for example. Using development containers with editors other than
VS Code is not well supported, though Microsoft has been working on a standalone
[devcontainer CLI](https://github.com/devcontainers/cli).

To use the development container in this repo, first ensure that you have
[Docker installed](https://docs.docker.com/get-docker/) on your system, and the
Docker daemon is running.

If you use VS Code for development, make sure you install the
[Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
extension. Upon opening this repo in VS Code, you should be prompted to "Reopen
in dev container". If you are not prompted, or want to trigger this manually
later, you can select "Dev Containers: Reopen in Container" from the command
palette.

If you do not use VS Code for development, you can use the devcontainer CLI to
start the container with `devcontainer up`. `devcontainer exec` will allow you
to execute commands in the container, including starting a shell session.

### Setting up a development environment manually

The above options aim for reproducible development environments that are
isolated to this repository. This makes them less likely to impact the rest of
your system, and less likely to introduce "it works on my machine"-style bugs.
For these reasons, we highly recommend using one of these approaches for setting
up a development environment.

If you would still prefer to set up your development environment manually, you
can use the development container and flake files as guides. Here's what you'll
need:

- Python 3.11
- [Poetry](https://python-poetry.org/)
- [ffmpeg](https://ffmpeg.org/)
- [SQLite](https://www.sqlite.org/index.html)
- Node.js 18.x
- [Yarn](https://yarnpkg.com/) (can be installed with `corepack enable` after
  installing Node)

## Installing dependencies

Once you have your development environment set up, you'll need to install
dependencies. This repo uses Poetry for Python package management and Yarn for
Node.js package management. Both of these tools should be available after
following one of the development environment setup flows.

To install Python dependencies, run:

```shell
poetry install
```

To install Node.js dependencies, run:

```shell
yarn
```

## Running the development servers

There are scripts for running the development servers.

To run the API server, run:

```shell
./scripts/dev.sh
```

This will run the API server on port 8000. If you visit
[http://localhost:8000](http://localhost:8000) in your browser, you should see a
"Hello World" message.

To run the web server, first create a file called `.env.local` in the `web`
directory. It should contain the contents:

```bash
# You can set this to a different value if you want to use a production
# Storyteller API host, or if you run the development server on a different
# port.
STORYTELLER_API_HOST=http://localhost:8000
```

:::info

You can also create a `.env.local` file at the root of the repo if you need to
configure any environment variables for the API server, such as the
`STORYTELLER_ROOT_PATH` or `STORYTELLER_BATCH_SIZE`.

:::

Then, run:

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
