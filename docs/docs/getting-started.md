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

## Making a network

The two backend services, the API and the web interface server, need to be able
to communicate with each other, so we need to place them both on the same Docker
network.

```shell
docker network create -d bridge storyteller
```

## Running the API server

The Storyteller API server and web interface are both distributed as Docker
images, available on the GitLab Container Registry. The API server is available
at `registry.gitlab.com/smoores/storyteller/api`.

The API server saves a lot of data to the local filesystem; it's not uncommon to
have over 1GB of data for a single book. It's important to mount a volume at the
`/data` directory in the container so that your content isn't lost when you
restart or update your container.

The server listens on port 8000 by default, and this can be configured with the
`UVICORN_PORT` environment variable.

The following will run the API server on port 8000, saving Storyteller caches
and synced books to the user's Documents directory. The `-it` flags will allow
you to kill the process with Ctrl+C; you can alternatively use the `-d` flag to
run the process in the background:

```shell
docker run \
   -it \
   -v ~/Documents/Storyteller:/data \
   -p 8000:8000 \
   --name storyteller-api \
   --network storyteller \
   registry.gitlab.com/smoores/storyteller/api:latest
```

To test that the API is up and running, you can use
[curl](https://curl.se/docs/tutorial.html) or a web browser to access
`http://localhost:8000/`. If the API has successfully started, you should see
the response `{ "Hello": "World" }`.

## Running the web interface

The web interface image is available at
`registry.gitlab.com/smoores/storyteller/web`.

The web interface listens on port 8001 by default, and this can be configured
with the `PORT` environment variable.

You'll also need to instruct the web interface on where to find your API server.
You can do this with the `STORYTELLER_API_HOST` environment variable. If you've
followed the above instructions, and are running the API server locally on port
8000, then the following command will run the web interface on port 8001,
connected to your local API server. Note that the storyteller API port should
always be 8000 in the environment variable, even if you've exposed it as a
different port on your host machine:

```shell
docker run \
   -it \
   -e STORYTELLER_API_HOST=http://storyteller-api:8000 \
   -p 8001:8001 \
   --name storyteller-web \
   --network storyteller \
   registry.gitlab.com/smoores/storyteller/web:latest
```

## Now what?

Now that your service is up and running, you can start
[syncing books](/docs/syncing-books) and
[reading them](/docs/category/reading-your-books)!
