---
sidebar_position: 1
---

# Getting started

Storyteller is made up of three primary components:

1. **The API server** serves a REST API that powers the web interface and mobile
   apps. This is the component responsible for actually synchronizing audiobooks
   and ebooks.
2. **The web interface** is a simple administration interface for server
   administrators to manage books, users, and collections. Also provides a
   simple interface for viewing and downloading books for users that don't wish
   to use the Storyteller mobile apps.
3. **The mobile apps** provide an actual reading and listening experience for
   the synced books produced by Storyteller.

As an instance administrator, you'll need to run the Storyteller API server and
web interface. You and your users can connect to your instance from the mobile
apps, or download the synced books from the web interface.

**Note:** Before going further, take a moment to read the documentation on
[minimum necessary resources](/docs/resources) and make sure that you have a
machine that will be able to run Storyteller!

## Docker compose

There's a compose file in the project repository, embedded here for ease of use:

```yaml
# Example compose config for Storyteller

services:
  api:
    image: registry.gitlab.com/smoores/storyteller/api:latest
    volumes:
      # This can be whatever you like; you can even use a
      # named volume rather than a bind mount, though it's easier
      # to inspect the files with a mount.
      # If you're running on macOS or Windows, you may want to
      # consider using a named volume, which will considerably
      # improve performance.
      - ~/Documents/Storyteller:/data:rw

  web:
    image: registry.gitlab.com/smoores/storyteller/web:latest
    environment:
      - STORYTELLER_API_HOST=http://api:8000
    ports:
      - "8001:8001"
```

To run, simply create a file named `compose.yaml` in the current directory with
the above contents (modified as needed), and run `docker compose up`. Once the
services have started, you can start [syncing books](/docs/syncing-books) and
[reading them](/docs/category/reading-your-books)!

## Manual docker commands

### Making a network

The two backend services, the API and the web interface server, need to be able
to communicate with each other, so we need to place them both on the same Docker
network.

```shell
docker network create -d bridge storyteller
```

### Running the API server

The Storyteller API server and web interface are both distributed as Docker
images, available on the GitLab Container Registry. The API server is available
at `registry.gitlab.com/smoores/storyteller/api`.

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
   --name storyteller-api \
   --network storyteller \
   registry.gitlab.com/smoores/storyteller/api:latest
```

### Running the web interface

The web interface image is available at
`registry.gitlab.com/smoores/storyteller/web`.

The web interface listens on port 8001 by default, and this can be configured
with the `PORT` environment variable.

You'll also need to instruct the web interface on where to find your API server,
which you can do with the `STORYTELLER_API_HOST` environment variable. Since
we're running the API server on our custom Docker network in this example, we
can use the container name as its host name, as shown below.

The following command will run the web interface on port 8001, connected to your
local API server:

```shell
docker run \
   -it \
   -e STORYTELLER_API_HOST=http://storyteller-api:8000 \
   -p 8001:8001 \
   --name storyteller-web \
   --network storyteller \
   registry.gitlab.com/smoores/storyteller/web:latest
```

To test that the API is up and running, you can use
[curl](https://curl.se/docs/tutorial.html) or a web browser to access
`http://localhost:8001/api/`. If the API has successfully started, you should
see the response `{ "Hello": "World" }`.

## Now what?

Now that your service is up and running, you can start
[syncing books](/docs/syncing-books) and
[reading them](/docs/category/reading-your-books)!
