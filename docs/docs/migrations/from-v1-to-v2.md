# From v1 to v2

In v1, the web server and API server were distinct entities, and your web
browser needed to be able to communicate with both. This is why it was necessary
to specify the `STORYTELLER_ALLOWED_ORIGINS`, `STORYTELLER_API_HOST`, and
`PUBLIC_STORYTELLER_API_HOST` environment variables. You also needed to expose
both your web server and your api server, and mobile clients connected directly
to the API server.

In v2, the web server can now proxy any and all requests to the API server. This
is technically not a breaking change; existing setups will continue to work
after upgrading. But you can now:

- Remove the `STORYTELLER_ALLOWED_ORIGINS` and `PUBLIC_STORYTELLER_API_HOST`
  environment variables
- Point Storyteller mobile apps at the URL for your web server, rather than your
  API server
- Stop publishing your API server port. It only needs to be accessible to your
  web server, which will be the case if you use Docker Compose or a custom
  Docker network, as recommended in the
  [Getting Started](/docs/getting-started).
