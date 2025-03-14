---
sidebar_position: 3
---

# Introduction to Docker

## Background

In order to provide some context for a discussion of Docker and why it’s useful,
we’ll need to take a step back and talk about different kinds of software. The
kind of software that everyday technology users are most familiar with is often
referred to as an **application**, or an app. This is software that is designed
to be installed directly on the end-user’s device. Your web browser is an
application, so is your calendar app on your phone.

Another very common kind of software, which everyday technology users interact
with very regularly but are less familiar with, is a **service**. Services
consist of software that runs on someone else’s devices, and which end-users
only interact with indirectly, via some application on the end-user’s device.
TikTok, for example, has a number of services that run on large computers owned
by ByteDance, and the TikTok application that users install on their phones
communicates with those services.

The Storyteller alignment server is a **service**. It’s designed to run on a
designated device, like your desktop computer, and interact with applications,
like the Storyteller mobile apps and the Storyteller web interface.

Because services have different needs from applications, the process for
developing and distributing (often called “deploying”) them is different. One
such need is to run continuously on a computer that may also be running many
other services at the same time. These sibling services may be fighting amongst
each other for resources, like CPU access and memory usage, and locations in
storage to store files. They may also require incompatible versions of _other_
software to be installed on the server. One service may require version 2.7 of
the Python programming language, while another requires 3.10. If they attempt to
install these different versions in the same location, they can break each
other’s functionality!

## What is Docker?

Docker is a software platform that provides one approach to mitigating the
challenges of deploying services to computers that also have other software on
them: **containerization**. The central unit of the Docker model is the
**container**, an isolated environment that runs a piece of software. A program
running within a container doesn’t know anything about the actual computer it’s
running on (sometimes called the “host” computer) — it’s _isolated_ from any
other software on that computer. Without being specifically given access, it
can’t read or write from the host computer’s file system, talk to other services
running on the host, or use software packages installed on the host. This last
condition means that containers must be self-sufficient — all of the code
necessary to run the program in the container must be available within the
container itself!

In order to be able to easily, consistently create these containers, software
developers produce **images**. An image is like a description of how to create a
container for a given type of software. These images are what we publish to
Storyteller’s Container Registry on GitLab, and they’re what users download when
they want to run the Storyteller alignment server.

:::info The gist

Docker is a platform for creating, managing, and running **containers**, which
are isolated environments for running software. Containers are defined by
**images**, which are descriptions of everything needed to run a given piece of
software.

Users can download an image and use Docker to create a container from it!

:::

## How do I use Docker?

Docker is primarily a command line tool. It can be used on macOS, Windows, and
Linux, though on macOS and Windows, it requires installing the Docker Desktop
application. Technically, under the hood, Docker Desktop runs a Linux virtual
machine, because… _actually_ Docker can only be run on Linux!

<details>
    <summary>Installing Docker on Windows</summary>

On Windows in particular, we highly recommend using the
[Windows Subsystem for Linux (WSL) 2 backend for Docker Desktop](https://docs.docker.com/desktop/features/wsl/).
This will enable you to easily interact with the Docker commmand line tool from
your WSL command line, and is required for some Storyteller features, like using
NVIDIA GPUs to speed up transcription.

</details>

There are a _lot_ of commands in the Docker command line interface, but most of
them aren’t important if you’re just trying to run a container that someone else
has built for you. Here’s how we could use Docker to retrieve the Storyteller
image, create a container from it, and then start that container:

:::info In the terminal

The rest of this introduction will heavily utilize the terminal. This is an
application available on Linux and macOS computers — on Windows, you may need to
install the application “Windows Terminal” from the Microsoft Store.

You can type commands into the terminal, and it will run programs for you! Don’t
worry, you’ll get the hang of it

:::

```bash
# First, we tell Docker to download the Storyteller image from its registry on GitLab
# The tag :latest, at the end, says to download the very newest version of the image.
# We could instead download a specific version with a different tag, like :web-v1.2.1
docker image pull registry.gitlab.com/storyteller-platform/storyteller:latest

# Then, we tell Docker to create a container, which we name `storyteller`, from the
# image that we pulled in the last step
docker container create --name storyteller registry.gitlab.com/storyteller-platform/storyteller:latest

# Finally, we start the container that we've created
docker container start storyteller

   ▲ Next.js 15.1.2
   - Local:        http://localhost:8001
   - Network:      http://0.0.0.0:8001

```

And now Storyteller is running! If you go to your web browser and enter the URL
[http://localhost:8001](http://localhost:8001), you’ll see… nothing?

## Accessing the container

Right! The software is running _in a container_. It’s isolated from the rest of
your computer, including your web browser. Now we need a way to tell Docker that
it’s okay to expose _some_ parts of the container environment to the host, so
that we can actually, you know, use it!

First, stop the container. You can do this by typing `Ctrl+C` (the control key
and the C key, simultaneously) into your terminal. Then, we’ll remove the
container:

```bash
docker container remove storyteller
```

### Ports

Now, let’s create a new container, but this time, with some carefully places
holes in it! We’re going to start by exposing a **port**. Networking ports on a
computer are a bit like physical ports that you might plug a USB cable into —
software can _listen_ on a specific port (identified by a number), and other
software can _connect_ to that port, allowing the two to communicate. This is
how your web browser works — web services almost always run on port 443, so when
you type `gitlab.com` into your web browser, it actually makes a connection to
`gitlab.com:443`.

Since Storyteller is also a networked service, it, too, listens for connections
on a port. By default, Storyteller listens on port 8001 (this was chosen
arbitrarily), as we saw in the output when we ran the Storyteller container
earlier. So let’s create our container again, but this time, we’ll “publish”
port 8001, so that it’s also accessible on the host computer:

```bash
# The --publish flag takes as an argument the host port, a colon, and then the container port
# Storyteller, within the container, is listening on port 8001. Here, we expose it on port
# 8001 on the host, as well, but we could use --publish 8080:8001 to expose it on port 8080
# on the host, instead, for example.
docker container create --name storyteller --publish 8001:8001 registry.gitlab.com/storyteller-platform/storyteller:latest

# And now let’s start Storyteller again!
docker container start storyteller

    ▲ Next.js 15.1.2
    - Local:        http://localhost:8001
    - Network:      http://0.0.0.0:8001
```

Try going to [http://localhost:8001](http://localhost:8001) in your browser
again — this time you should see the Storyteller admin creation page!

### Bind mounts

There’s one more thing that we need to expose from the container — the files!
Storyteller saves a database file and all of the files used to align books
(including the aligned books themselves) in a folder called `/data`. Right now,
that folder lives within the container, which means that every time the
container is removed and recreated (which happens any time we need to update
Storyteller, for example), all of those files will be destroyed.

So that we don’t lose all of our books, we can “bind” that `/data` directory to
a directory on our host computer. For this example, we’ll pick
`~/Documents/Storyteller`, which is a folder called “Storyteller” in the
“Documents” folder in our home folder. Don’t worry if that directory doesn’t
exist yet, Docker will create it for us!

Again, let’s use `Ctrl+C` to stop our old container, and use
`docker container remove storyteller` to delete it. Now, we’ll create one last
container, with both the published port and our new bind mount:

```bash
# Note: The `\` character lets us put this command on multiple lines. It was
# getting long!
#
# Just like the --publish flag, the --volume flag argument is a host directory,
# a colon, and a container directory.
docker container create --name storyteller \
  --publish 8001:8001 \
  --volume ~/Documents/Storyteller:/data \
  registry.gitlab.com/storyteller-platform/storyteller

docker container start storyteller

    ▲ Next.js 15.1.2
    - Local:        http://localhost:8001
    - Network:      http://0.0.0.0:8001
```

Now, check out your Documents/Storyteller folder, and you should see a file
called `storyteller.db`! This is the Storyteller database — the next time the
Storyteller container is run, even if it’s been recreated, it will re-use this
database file.

## What’s next?

This is only the very basics of what is a very deep topic. But hopefully this
gives you enough of a background to get started with running Storyteller
yourself. Head back over to the [Getting Started](/docs/intro/getting-started)
docs and give it a shot!
