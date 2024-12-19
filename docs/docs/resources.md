---
sidebar_position: 2
---

# Resource Requirements

AI-based audio transcription is a fairly resource-intensive task, so it will not
run well on all hardware. Here is a table describing some requirements for
running the Storyteller backend:

| Component | Requirements           | Notes                                                                                                                                                                                                            |
| --------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CPU       | Intel/AMD              | At this time, Storyteller is not compatible with ARM CPUs, including Apple Silicon                                                                                                                               |
| GPU       | NVIDIA (CUDA 11.8)     | A GPU is _not_ required to run Storyteller. See [the docs on GPU acceleration](/docs/aligning-books#using-cuda-for-gpu-accelerated-transcription)                                                                |
| Storage   | 10 GB (30 GB for CUDA) | This is the bare minimum necessary to run; remember that each book will also take close to a gigabyte of storage.                                                                                                |
| Memory    | 8 GB                   | If using Docker Desktop for Windows or Mac, make sure that your Docker VM (or WSL2 VM, if using WSL2) is configured with at least 8GB of memory                                                                  |
| Swap      | ~12 GB (?)             | If you find that transcription processes are dying unexpectedly, and you can't increase the amount of memory available, increasing swap can keep processes from being killed, though it may slow down processing |
