# From v3 to ... v0.4?

Ok, to start off: I goofed. For simplicity's sake, when I started talking about
the first breaking change in Storyteller, I called the version that folks had
been using "v1" and the new version "v2". But really, that wasn't right:
Storyteller still isn't stable, and properly those were v0.1 and v0.2.

Storyteller is getting _much_ closer to its first stable release, though, and
that means a proper v1 is coming, so now's as good a time as any to correct the
versioning scheme. This release is **v0.4**!

Now, on to the actual migration. This one is pretty simple.

## No more CUDA-specific images

All users should switch to the `latest` image tag going forward. No new versions
will be published to the `cuda-latest` tag. You can now more easily switch your
transcription target device with the
[transcription engine settings](/docs/administering#transcription-engine-settings).

The way this works is that the first time the container runs a transcription job
with a given transcription engine/build target, it will install any necessary
dependencies (e.g. OpenBLAS or the CUDA toolkit) and build whisper.cpp from
source for that target. This may take several minutes, but it will only happen
the first time running a transcription job after an upgrade.

## No more CUDA-specific environment variables

Storyteller now supports CUDA devices for transcription with no environment
variable configuration. That means you no longer have to restart your container
in order to try out new configurations.

Note: The Storyteller container defaults to setting `NVIDIA_VISIBLE_DEVICES=all`
and `NVIDIA_DRIVER_CAPABILITIES=compute,utility`. If you have multiple NVIDIA
GPUs and wish to only expose one or some of them to the Storyteller container,
you may want to set `NVIDIA_VISIBLE_DEVICES` to a different value in your
compose file.
