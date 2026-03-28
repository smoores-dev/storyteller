---
sidebar_position: 2
---

# Self-hosting Storyteller

---

Storyteller is a _platform_ for immersive reading. We provide tools for
creating, managing, and reading/listening to ebooks with guided narration.
Because we rely on open specifications, such as the EPUB 3 Media Overlay spec,
you can use each part of the Storyteller platform alongside other software as
well! You’re not locked in.

**The server** serves a REST API that powers the mobile apps, as well as a web
interface for managing your Storyteller instance and library of ebooks,
audiobooks, and readaloud books. This is the component responsible for actually
aligning audiobooks and ebooks.

**The mobile apps** provide a reading and listening experience for ebooks,
audiobooks, and the readaloud books produced by Storyteller.

As an instance administrator, you'll need to run the Storyteller server. You and
your users can connect to your instance from the mobile apps, or download the
aligned books from the web interface.

:::info Minimum resources

Before going further, take a moment to read the documentation on
[minimum necessary resources](/docs/installation/resources) and make sure that
you have a machine that will be able to run Storyteller!

If you don't, or you'd rather not have to go through the hassle of managing your
own server (it can be fun, really!), you can also create a Storyteller instance
on [PikaPods](https://www.pikapods.com/pods?run=storyteller) or
[ElfHosted](https://store.elfhosted.com/product/storyteller/). PikaPods and
ElfHosted are services for running open source apps like Storyteller. They're
paid services, and they share profits with open source maintainers, so every
PikaPods/ElfHosted instance helps support future Storyteller development.

But if you think you would be interested in self-hosting, and you're just not
sure how to get started, don't hesitate to reach out for help!
[We've got a great community](/docs/say-hi), and we'd be happy to help you get
started.

:::

---

## How to run the Storyteller server

The Storyteller server (also referred to as the “backend server” or the “web
server”) is published as a Docker image on the GitLab Container Registry. You
can manually use the Docker command line interface to pull the image, create a
container, and start it with a command like the following:

```bash
# Storyteller requires a secret key for authentication
export STORYTELLER_SECRET_KEY=$(openssl rand -base64 32)

docker run \
  -it \
  --name storyteller \
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
    [introduction to Docker for self-hosters](/docs/tutorials/docker), ask
    questions in our [Discord server](https://discord.gg/KhSvFqcrza), or, as
    a last resort, [run Storyteller on PikaPods](https://www.pikapods.com/pods?run=storyteller)
    or [ElfHosted](https://store.elfhosted.com/product/storyteller/),
    where they will do all of the hard work for you!

</details>

---

## Docker Compose

It’s nice that it’s so easy to get Storyteller running (just two commands!), but
that docker command doesn’t exactly roll off the tongue. We recommend using
Docker Compose, a system for declaratively configuring Docker containers, for
actually managing your Storyteller instance long-term. To do so, create a new,
empty folder called “storyteller” (it can be called anything you like, but
“storyteller” or “Storyteller” will probably be easiest to remember!) and create
a file within it called `compose.yaml`. This will be our Docker compose
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

To run the container with Docker Compose, we use the `compose` subcommand for
Docker. Here is a quick summary of some useful commands:

- The command `docker compose up` will create and start all containers in the
  `compose.yaml` file (ours only has one, `web`). You can add the `-d` flag to
  run the containers in the background.
- `docker compose down` will stop _and remove_ all containers.
- `docker compose start` and `docker compose stop` can be used to start and stop
  the container, without removing and recreating it.
- `docker compose pull` will pull the latest images for all containers in the
  `compose.yaml`.
- `docker compose logs` will display the logs for the containers. You can add
  the `-f` flag to "follow" the logs — they will stream live from the container
  until you press `Ctrl+C` to stop them.

---

##

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

---

## Permission management, running as a different user

:::note

This is a slightly advanced topic. If you don't know what `UID` and `GID` are,
you probably don't need to worry about it!

:::

Storyteller by default runs as the `storyteller` user with `UID` and `GID`
`1000` in the container. If you want to run it as a different user for reasons,
you can set the `PUID` and `PGID` environment variables.

```yaml
services:
  web:
    image: registry.gitlab.com/storyteller-platform/storyteller:latest
    volumes:
      - ~/Documents/Storyteller:/data:rw
    environment:
      - STORYTELLER_SECRET_KEY_FILE=/run/secrets/secret_key
      - PUID=1001
      - PGID=1001
    ports:
      - "8001:8001"
    secrets:
      - secret_key

secrets:
  secret_key:
    file: ./STORYTELLER_SECRET_KEY.txt
```

We do this by first starting the container as root, making sure the
`storyteller` user in the container can access configuration on internal files
necessary for the container to run, and then dropping privileges to the
`storyteller` user.

What we cannot (or rather, will not!) do is change the ownership of any other
volumes mounted into the container, such as your books library. This means you
should be cautious about changing the `PUID` and `PGID` environment variables:
you need to make sure that those `UID` and `GID` are able to to access your book
library.

:::info{title="Example"}

Your docker file looks something like this:

```yaml
services:
  web:
    image: registry.gitlab.com/storyteller-platform/storyteller:latest
    volumes:
      # storyteller's internal data directory: this is where it stores its database, covers, transcriptions, and any ebooks and audiobooks you upload to it.
      - ~/Documents/Storyteller:/data:rw
      # another folder where you store books you want storyteller to auto-import from.
      - ~/Files/Books:/library:rs
    environment:
      - STORYTELLER_SECRET_KEY_FILE=/run/secrets/secret_key
      - PUID=1001
      - PGID=1001
```

:::

:::danger

Do NOT set `user:` in `compose.yaml`, or use `-u/--user` with `docker run`!

Storyteller expects to be in control of assigning the uid/gid of the
`storyteller` user, and cannot handle any ownership issues that may arise from
starting the container as a non-root user. It is extremly likely you will end up
with permission issues in your `/data` volume this way.

If you think you know better, you can set the `FORCE_USER_SETTING=1` environment
variable to allow this.

:::

---

## Additional env variables for configuration

Storyteller can be configured with a number of additional environment variables.

<!-- AUTO-GENERATED-ENV-VARS-START -->

| Variable Name                     | Description                                                                                                                                                                                           | Default                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| AUTH_URL                          | [Required for OAuth](https://storyteller-platform.gitlab.io/storyteller/docs/settings#setting-the-auth_url-environment-variable)                                                                      | N/A                                        |
| ENABLE_WEB_READER                 | [Enable the experimental web reader by setting to `true`.](https://storyteller-platform.gitlab.io/storyteller/docs/reading/web-reader)                                                                | `false`                                    |
| FORCE_USER_SETTING                | Set to `true` to allow _starting_ the container as a non-root user.                                                                                                                                   | -                                          |
| PGID                              | The gid of the user to run Storyteller as.                                                                                                                                                            | `1000`                                     |
| PUID                              | The uid of the user to run Storyteller as.                                                                                                                                                            | `1000`                                     |
| READIUM_PORT                      | Port for the Readium server.                                                                                                                                                                          | `8002`                                     |
| STORYTELLER_CONFIG                | [Path to a JSON configuration file.](#declarative-configuration) Settings in this file override database settings and cannot be changed via the UI.                                                   | N/A                                        |
| STORYTELLER_DATA_DIR              | Directory where Storyteller will store its data.                                                                                                                                                      | Current Directory (`/data` in container)   |
| STORYTELLER_DB_DIR                | Directory where Storyteller will store its database files.                                                                                                                                            | `STORYTELLER_DATA_DIR`                     |
| STORYTELLER_DB_FILENAME           | Filename for the Storyteller database.                                                                                                                                                                | `storyteller.db`                           |
| STORYTELLER_DEMO_MODE             | Enable demo mode by setting to `true`. (Used for [demo-storyteller.elfhosted.com](https://demo-storyteller.elfhosted.com))                                                                            | `false`                                    |
| STORYTELLER_INITIAL_AUDIO_CODEC   | Initial audio codec to use. Options are `mp3`, `aac`, `opus`, `opus-16`, `opus-24`, `opus-32`, `opus-64`, `opus-96`.                                                                                  | N/A                                        |
| STORYTELLER_LOG_LEVEL             | Log level for Storyteller. Options are `error`, `warn`, `info`, `debug`, `trace`.                                                                                                                     | `info`                                     |
| STORYTELLER_MAX_UPLOAD_CHUNK_SIZE | Upload chunk size limit in megabytes.                                                                                                                                                                 | `10` (10 MB)                               |
| STORYTELLER_SECRET_KEY            | The secret key for the instance. Either this or STORYTELLER_SECRET_KEY_FILE must be set.                                                                                                              | N/A                                        |
| STORYTELLER_SECRET_KEY_FILE       | Path to a file containing the secret key for the instance. Either this or STORYTELLER_SECRET_KEY must be set.                                                                                         | N/A                                        |
| STORYTELLER_WHISPER_REPO          | Repo to download whisper.cpp from.                                                                                                                                                                    | `https://github.com/ggerganov/whisper.cpp` |
| STORYTELLER_WHISPER_VARIANT       | The whisper.cpp build variant baked into this image (e.g. linux-x64-cpu, linux-x64-cuda-12.9.0). Set automatically by Docker builds. When not set, `ghost-story` will detect or use what's installed. | N/A                                        |
| STORYTELLER_WHISPER_VERSION       | Version of whisper.cpp to download.                                                                                                                                                                   | `v1.8.2`                                   |

<!-- AUTO-GENERATED-ENV-VARS-END -->

---

## Declarative Configuration

Settings can be managed via a JSON file instead of the web UI. Set
`STORYTELLER_CONFIG` to the path of your configuration file:

```yaml
environment:
  - STORYTELLER_CONFIG=/config/storyteller.json
```

The configuration file contains any settings you want to override. You can
export your current settings as a starting point using the "Export as JSON"
button on the Settings page.

```json
{
  "libraryName": "My Library",
  "webUrl": "https://storyteller.example.com",
  "transcriptionEngine": "whisper.cpp"
}
```

Settings in the configuration file override database values, cannot be changed
through the UI, and are validated on startup.

### Secrets

For sensitive values, append `_file` to any setting name to read the value from
a file. This works well with Docker or Kubernetes secrets:

```json
{
  "smtpPassword_file": "/run/secrets/smtp_password",
  "authProviders": [
    {
      "kind": "custom",
      "name": "Authelia",
      "clientSecret_file": "/run/secrets/oidc_secret"
    }
  ]
}
```

---

## Now what?

To create your admin account and get started, head to http://localhost:8001 in a
browser on the server computer and continue on to the
[settings documentation](settings.md)!

Once your service is up and running, you can start [adding](managing/adding.md),
[aligning](managing/aligning.md), [organizing](managing/organizing.md) and
[reading](reading/playing-readalouds.md) all of your books and audiobooks!

---
