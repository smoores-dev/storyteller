---
sidebar_position: 1
---

# Getting started

Storyteller is made up of two primary components:

1. **The backend server** serves a REST API that powers the mobile apps, as well
   as a web interface for managing your Storyteller instance. This is the
   component responsible for actually synchronizing audiobooks and ebooks.
2. **The mobile apps** provide an actual reading and listening experience for
   the synced books produced by Storyteller.

As an instance administrator, you'll need to run the Storyteller backend server.
You and your users can connect to your instance from the mobile apps, or
download the synced books from the web interface.

**Note:** Before going further, take a moment to read the documentation on
[minimum necessary resources](/docs/resources) and make sure that you have a
machine that will be able to run Storyteller!

## Docker compose

There's a compose file in the project repository, embedded here for ease of use.
**Please actually take a moment to generate a secret key**; without it, your
Storyteller user accounts _are not meaningfully secure_. You can do so with your
password manager, the `openssl` command as recommended in the compose file
below, or use
[1Password's online random password generator](https://1password.com/password-generator/).

```yaml
# Example compose config for Storyteller

services:
  web:
    image: registry.gitlab.com/smoores/storyteller:latest # For CUDA, use registry.gitlab.com/smoores/storyteller:cuda-latest
    # Uncomment for CUDA
    # runtime: nvidia
    volumes:
      # This can be whatever you like; you can even use a
      # named volume rather than a bind mount, though it's easier
      # to inspect the files with a mount.
      # If you're running on macOS or Windows, you may want to
      # consider using a named volume, which will considerably
      # improve filesystem I/O performance. See these VS Code
      # docs for more information:
      # https://code.visualstudio.com/remote/advancedcontainers/improve-performance#_use-a-targeted-named-volume
      - ~/Documents/Storyteller:/data:rw
    environment:
      # Generate a cryptopgraphically secure random string,
      # e.g. with:
      #  openssl rand -base64 32
      - STORYTELLER_SECRET_KEY=<some random value>
      # Uncomment for CUDA
      # - STORYTELLER_DEVICE=cuda

    ports:
      - "8001:8001"
```

To run, simply create a file named `compose.yaml` in the current directory with
the above contents (modified as needed), and run `docker compose up`. Once the
services have started, you can start [syncing books](/docs/syncing-books) and
[reading them](/docs/category/reading-your-books)!

## Manual docker commands

### Running the backend server

The Storyteller backend server is distributed as a Docker image, available on
the GitLab Container Registry at
`registry.gitlab.com/smoores/storyteller:latest`
(`registry.gitlab.com/smoores/storyteller:cuda-latest` for a CUDA-enabled
build).

The API server saves a lot of data to the local filesystem; it's not uncommon to
have over 1GB of data for a single book. It's important to mount a volume at the
`/data` directory in the container so that your content isn't lost when you
restart or update your container.

The following will run the API server, saving Storyteller caches and synced
books to the user's Documents directory. The `-it` flags will allow you to kill
the process with Ctrl+C; you can alternatively use the `-d` flag to run the
process in the background:

```shell
docker run \
   -it \
   -v ~/Documents/Storyteller:/data \
   --name storyteller \
   registry.gitlab.com/smoores/storyteller:latest
```

To test that the server is up and running, you can use
[curl](https://curl.se/docs/tutorial.html) or a web browser to access
`http://localhost:8001/api/`. If the API has successfully started, you should
see the response `{ "Hello": "World" }`.

## Now what?

Now that your service is up and running, you can start
[syncing books](/docs/syncing-books) and
[reading them](/docs/category/reading-your-books)!
