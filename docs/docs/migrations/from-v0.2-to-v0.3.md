# From v0.2 to v0.3

In v0.1 and v0.2, there were two different backend services; one to serve the
JSON API, and one to serve the web interface.

In v0.3, these have been consolidated into a single server. This means that you
no longer need a compose file with two service entries. Except for
`STORYTELLER_API_HOST`, all environment variables that were supported in v0.2
are still supported, and can be placed on the single new compose service. The
image for this service should be
`registry.gitlab.com/smoores/storyteller:latest` for CPU-only instances, or
`registry.gitlab.com/smoores/storyteller:cuda-latest` for CUDA-enabled
instances.
