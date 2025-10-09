---
sidebar_position: 3
---

# GPU and UNRAID installations

## GPU Acceleration

The most resource-intensive part of Storyteller’s forced alignment process is
transcription, where Storyteller uses a local or hosted AI-powered transcription
engine to transcribe the audiobook’s contents. If you’re running Storyteller’s
transcription locally with `whisper.cpp`, you can greatly speed up the
transcription step by running it on a dedicated GPU, if you have one. Depending
on your CPU and GPU, this can sometimes be a speedup of 10x or greater.

### GPU-acceleration on macOS

There is a whole seperate community guide for setting up
[GPU-acceleration on macOS](community-guides/using-gpu-accelerated-whisper.md).

### NVIDIA GPUs

Storyteller can use your CUDA-enabled NVIDIA GPU to accelerate the transcription
phase (see [transcription engine settings](settings.md#transcription-settings)
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
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

secrets:
  secret_key:
    file: ./STORYTELLER_SECRET_KEY.txt
```

### AMD GPUs

Storyteller can use your ROCm-enabled AMD GPU to accelerate the transcription
phase (see [transcription engine settings](settings.md#transcription-settings)
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

---

## Unraid App Template

If you plan on hosting Storyteller on an [Unraid](https://unraid.net) server,
you can install Storyteller via the Community Apps Plugin. Just search for
Storyteller and follow the instructions in the template. **Make sure to follow
[the instructions](installation/self-hosting.md#secrets) to generate a secure
secret.**

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

---
