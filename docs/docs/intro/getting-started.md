---
sidebar_position: 1
---

# Getting started

Storyteller is a _platform_ for immersive reading. We provide tools for
creating, managing, and reading/listening to ebooks with guided narration.
Because we rely on open specifications, such as the EPUB 3 Media Overlay spec,
you can use each part of the Storyteller platform alongside other software as
well! You’re not locked in.

**The alignment server** serves a REST API that powers the mobile apps, as well
as a web interface for managing your Storyteller instance and library of aligned
books. This is the component responsible for actually aligning audiobooks and
ebooks.

**The mobile apps** provide an actual reading and listening experience for the
aligned books produced by Storyteller.

As an instance administrator, you'll need to run the Storyteller alignment
server. You and your users can connect to your instance from the mobile apps, or
download the aligned books from the web interface.

<details>
    <summary>What does alignment mean?</summary>

The process that Storyteller uses to line up the text of your ebook with the
audio of your audiobook belongs to a category of algorithms called “forced
alignment.” We call a book that Storyteller has processed “aligned,” and the
process itself “alignment.”

</details>

:::info Minimum resources

Before going further, take a moment to read the documentation on
[minimum necessary resources](/docs/intro/resources) and make sure that you have
a machine that will be able to run Storyteller!

If you don't, or you'd rather not have to go through the hassle of managing your
own server (it can be fun, really!), you can also create a Storyteller instance
on [PikaPods](https://www.pikapods.com/pods?run=storyteller). PikaPods is a
service for running open source apps like Storyteller. It's a paid service, and
they share profits with open source maintainers, so every PikaPods instance
helps support future Storyteller development.

But if you think you would be interested in self-hosting, and you're just not
sure how to get started, don't hesitate to reach out for help!
[We've got a great community](/docs/say-hi), and we'd be happy to help you get
started.

:::

## How to run the Storyteller alignment server

The Storyteller alignment server (also referred to as the “backend server” or
the “web server”) is published as a Docker image on the GitLab Container
Registry. You can manually use the Docker command line interface to pull the
image, create a container, and start it with a command like the following:

```bash
# Storyteller requires a secret key for authentication
export STORYTELLER_SECRET_KEY=$(openssl rand -base64 32)

docker run \
  -it \
  -name storyteller \
  -v ~/Documents/Storyteller:/data:rw \
  -p 8001:8001 \
  -e STORYTELLER_SECRET_KEY=$STORYTELLER_SECRET_KEY \
  registry.gitlab.com/storyteller-platform/storyteller:latest
```

This will start a basic Storyteller server on port 8001! Any data, including the
database files and any uploaded or aligned book files will be stored in
`~/Documents/Storyteller`.

<details>
    <summary>What’s a Docker image?</summary>

    A Docker image describes an isolated environment to run a software program
    in. The resulting environment is called a Docker “container.” If you’re
    familiar with software development, there are [introductory videos and docs
    on the Docker documentation site](https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-a-container/).

    If that’s a bunch of gibberish to you, no worries! You can read through our
    [introduction to Docker for self-hosters](/docs/intro/intro-to-docker), ask
    questions in our [Discord server](https://discord.gg/KhSvFqcrza), or, as
    a last resort, [run Storyteller on PikaPods](https://www.pikapods.com/pods?run=storyteller),
    where PikaPods will do all of the hard work for you!

</details>

## Docker Compose

It’s nice that it’s so easy to get Storyteller running (just two commands!), but
that docker command doesn’t exactly roll off the tongue. We recommend using
Docker Compose, a system for declaratively configuring Docker containers, for
actually managing your Storyteller instance long-term. To do so, create a new,
empty folder called “storyteller” (it can be called anything you like, but
storyteller or Storyteller will probably be easiest to remember!) and create a
file within it called `compose.yaml`. This will be our Docker compose
configuration file.

To start, here’s how we could configure Docker compose to run the Storyteller
container just like we did above with our manual command:

```yaml
services:
  web:
    image: registry.gitlab.com/storyteller-platform/storyteller:latest
    volumes:
      - ~/Documents/Storyteller:/data:rw
    environment:
      - STORYTELLER_SECRET_KEY=$STORYTELLER_SECRET_KEY
    ports:
      - "8001:8001"
```

This will be easier to maintain and modify as you administer your Storyteller
instance. You can make whatever changes you need, such as choosing a different
mount location for the volume or a different port for the service to run on.

## Secrets

:::warning Do not skip this step

We know, you just want to get Storyteller running so that you can read your
books! But it’s crucially important that you generate a secure key. Even if you
aren’t going to expose your Storyteller server to the Internet or share it with
other users now, will you remember that you skipped this step if that changes in
the future?

Besides, it’s easy! It probably takes a longer time to read this plea than to
generate a secret. Trust us, it’s worth it!

:::

Storyteller requires exactly one “secret.” A secret, in software development,
refers to any piece of information that your users are absolutely not allowed to
see. The `STORYTELLER_SECRET_KEY` is used as part of the flow for generating
authentication tokens for users. **If someone else knew this secret, they could
forge authentication tokens for your Storyteller instance.** So it’s important
that it’s generated securely and kept safe!

Our compose configuration above assumes that your `STORYTELLER_SECRET_KEY` has
been stored as an environment variable, also called `STORYTELLER_SECRET_KEY`.
While this is an acceptable mechanism for storing your secret key, it’s both
simpler and more secure to store it in a file. Here’s how to do that:

1. First, generate a secure key with your password manager, the `openssl` CLI
   (`openssl rand -base64 32`), or use
   [1Password's online random password generator](https://1password.com/password-generator/).
2. Then place that key (it should be a random-looking string of numbers,
   letters, and symbols, like `q9XevwlhBJwP7XuZ71Q11JZ36s5IVAbrcndIlMf/EHo=`) in
   a text file in the same directory as your `compose.yaml` file. Name the file
   `STORYTELLER_SECRET_KEY.txt`
3. Update the `compose.yaml` file to reference the secret key file, like so:

```yaml
services:
  web:
    image: registry.gitlab.com/storyteller-platform/storyteller:latest
    volumes:
      - ~/Documents/Storyteller:/data:rw
    environment:
      # IMPORTANT: Change `STORYTELLER_SECRET_KEY` to `STORYTELLER_SECRET_KEY_FILE, and
      # set the value to exactly `/run/secrets/secret_key`
      - STORYTELLER_SECRET_KEY_FILE=/run/secrets/secret_key
    ports:
      - "8001:8001"
    secrets:
      - secret_key

# IMPORTANT: Add this secrets block
secrets:
  secret_key:
    file: ./STORYTELLER_SECRET_KEY.txt
```

## Unraid App Template

If you plan on hosting Storyteller on an [Unraid](https://unraid.net) server,
you can install Storyteller via the Community Apps Plugin. Just search for
Storyteller and follow the instructions in the template. **Make sure to follow
[the instructions above](#secrets) to generate a secure secret.**

### Mount the app files and media files on different shares

If you wish to separate your Storyteller “appdata” files from the larger media
files, configure the volumes as follows:

```
App Data:
---------
Container Path: /data
Host Path: /mnt/user/appdata/storyteller

Media:
------
Container Path: /data/assets
Host Path: /mnt/user/media/books  # Or whatever share/path you like!
```

## GPU Acceleration

The most resource-intensive part of Storyteller’s forced alignment process is
transcription, where Storyteller uses a local or hosted AI-powered transcription
engine to transcribe the audiobook’s contents. If you’re running Storyteller’s
transcription locally with `whisper.cpp`, you can greatly speed up the
transcription step by running it on a dedicated GPU, if you have one. Depending
on your CPU and GPU, this can sometimes be a speedup of 10x or greater.

### NVIDIA GPUs

Storyteller can use your CUDA-enabled NVIDIA GPU to accelerate the transcription
phase (see
[transcription engine settings](/docs/administering#transcription-engine-settings)
for more). In order to access your GPU from within the Docker container, you
_must_ install the
[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
and
[configure docker](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html#configuring-docker).
You’ll then need to add `runtime: nvidia` to your `compose.yaml` file in the
`web` service:

```yaml
services:
  web:
    image: registry.gitlab.com/storyteller-platform/storyteller:latest
    runtime: nvidia
    volumes:
      - ~/Documents/Storyteller:/data:rw
    environment:
      - STORYTELLER_SECRET_KEY_FILE=/run/secrets/secret_key
    ports:
      - "8001:8001"
    secrets:
      - secret_key

secrets:
  secret_key:
    file: ./STORYTELLER_SECRET_KEY.txt
```

### AMD GPUs

Storyteller can use your ROCm-enabled AMD GPU to accelerate the transcription
phase (see
[transcription engine settings](/docs/administering#transcription-engine-settings)
for more). In order to access your GPU from within the Docker container, you
must have AMD GPU drivers installed on your host machine. You'll then need to
pass the AMD devices through to the container in your `compose.yaml`:

```yaml
services:
  web:
    image: registry.gitlab.com/storyteller-platform/storyteller:latest
    volumes:
      - ~/Documents/Storyteller:/data:rw
    environment:
      - STORYTELLER_SECRET_KEY_FILE=/run/secrets/secret_key
    ports:
      - "8001:8001"
    secrets:
      - secret_key
    devices:
      - /dev/dri:/dev/dri
      - /dev/kfd:/dev/kfd

secrets:
  secret_key:
    file: ./STORYTELLER_SECRET_KEY.txt
```

#### Overriding the Radeon driver version

If you have an AMD GPU that has a driver version that is unsupported by your
Unraid AMD driver, you may be able to work around it by setting the environment
variable `HSA_OVERRIDE_GFX_VERSION` to a supported version number. E.g. for an
AMD Radeon RX 6700 XT, this value must be set to 10.3.0.

```yaml
services:
  web:
    image: registry.gitlab.com/storyteller-platform/storyteller:latest
    volumes:
      - ~/Documents/Storyteller:/data:rw
    environment:
      - STORYTELLER_SECRET_KEY_FILE=/run/secrets/secret_key
      - HSA_OVERRIDE_GFX_VERSION=10.3.0
    ports:
      - "8001:8001"
    secrets:
      - secret_key
    devices:
      - /dev/dri:/dev/dri
      - /dev/kfd:/dev/kfd

secrets:
  secret_key:
    file: ./STORYTELLER_SECRET_KEY.txt
```

## Now what?

To create your admin account and get started, head to
[`http://localhost:8001/`](http://localhost:8001) in a browser, and continue on
to the [administering](/docs/administering) docs!

Once your service is up and running, you can start
[aligning books](/docs/aligning-books) and
[reading them](/docs/category/reading-your-books)!
