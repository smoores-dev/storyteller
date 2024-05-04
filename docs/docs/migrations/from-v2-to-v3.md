# From v2 to v3

In v1 and v2, there were two different backend services; one to serve the JSON
API, and one to serve the web interface.

In v3, these have been consolidated into a single server. This means that you no
longer need a compose file with two service entries. With the exception of
`STORYTELLER_API_HOST`, all environment variables that were supported in v2 are
still supported, and can be placed on the single new compose service. The image
for this service should be `registry.gitlab.com/smoores/storyteller:latest` for
CPU-only instances, or `registry.gitlab.com/smoores/storyteller:cuda-latest` for
CUDA-enabled instances.
