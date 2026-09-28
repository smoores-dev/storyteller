import { timingSafeEqual } from "node:crypto"

import { type ServerType, serve } from "@hono/node-server"
import { Hono } from "hono"
import { createOpenApiDocument } from "hono-zod-openapi"
import { HTTPException } from "hono/http-exception"
import { z } from "zod/v4"

import { type FileStore, fileRoutes } from "./files.ts"
import { errorResponses, openApi } from "./openapi.ts"
import { type Model, PROTOCOL_VERSION, modelListSchema } from "./protocol.ts"

export const OPENAPI_PATH = "/openapi.json"

export interface Service<Capabilities = unknown> {
  name: string
  routes: Hono
  capabilities: () => Capabilities
  capabilitiesSchema: z.ZodType<Capabilities>
  models: () => Model[]
  [Symbol.asyncDispose]: () => Promise<void>
}

export interface HttpServerOptions {
  services: Service[]
  files: FileStore
  apiKey: string
}

export function createServer(options: HttpServerOptions): Hono {
  if (!options.apiKey) {
    throw new Error("The server needs an API key")
  }
  const expected = Buffer.from(options.apiKey, "utf-8")

  const app = new Hono()

  app.use("*", async (c, next) => {
    if (c.req.path !== OPENAPI_PATH) {
      const header = c.req.header("Authorization") ?? ""
      const provided = Buffer.from(
        header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "",
        "utf-8",
      )
      if (
        provided.length !== expected.length ||
        !timingSafeEqual(provided, expected)
      ) {
        return c.json({ error: "Unauthorized" }, 401)
      }
    }
    await next()
    return
  })

  app.get(
    "/v1/capabilities",
    openApi({
      tags: ["Server"],
      summary: "List the services and what they can do",
      description:
        "Call this first. Refuse a server whose protocol differs from your own.",
      responses: {
        200: z.object({
          protocol: z.literal(PROTOCOL_VERSION),
          services: z.object(
            Object.fromEntries(
              options.services.map((service) => [
                service.name,
                service.capabilitiesSchema,
              ]),
            ),
          ),
        }),
        ...errorResponses,
      },
    }),
    (c) =>
      c.json({
        protocol: PROTOCOL_VERSION,
        services: Object.fromEntries(
          options.services.map((service) => [
            service.name,
            service.capabilities(),
          ]),
        ),
      }),
  )

  app.get(
    "/v1/models",
    openApi({
      tags: ["Server"],
      summary: "List the models of every service",
      description: "OpenAI-compatible model list.",
      responses: { 200: modelListSchema, ...errorResponses },
    }),
    (c) =>
      c.json({
        object: "list" as const,
        data: options.services.flatMap((service) => service.models()),
      }),
  )

  app.route("/v1/files", fileRoutes(options.files))
  for (const service of options.services) {
    app.route("/v1", service.routes)
  }

  createOpenApiDocument(
    app,
    {
      info: {
        title: "ghost-story",
        version: String(PROTOCOL_VERSION),
        description: [
          "The HTTP API of `ghost-story serve`, which lets Storyteller run speech models on another machine.",
          "",
          "Upload audio once to `/v1/files` and refer to it by its SHA-256 afterwards. Every service responds the same way. `POST /v1/{service}` returns the result once the work is done. `POST /v1/{service}/jobs`.",
          "",
          "OpenAI-compatible transcription endpoint at `/v1/audio/transcriptions`.",
        ].join("\n"),
      },
      servers: [
        {
          url: "http://{host}:{port}",
          variables: {
            host: { default: "localhost" },
            port: { default: "8765" },
          },
        },
      ],
      components: {
        securitySchemes: {
          apiKey: {
            type: "http",
            scheme: "bearer",
            description:
              "The key passed to `ghost-story serve --api-key`. Required for every route, except for the OpenAPI document.",
          },
        },
      },
      security: [{ apiKey: [] }],
    },
    { routeName: OPENAPI_PATH },
  )

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return c.json({ error: error.message }, error.status)
    }
    return c.json({ error: error.message }, 500)
  })

  return app
}

export function listen(
  app: Hono,
  options: { host: string; port: number },
): Promise<ServerType> {
  return new Promise((resolve, reject) => {
    const server = serve(
      {
        fetch: app.fetch,
        hostname: options.host,
        port: options.port,
        serverOptions: { requestTimeout: 0 },
      },
      () => {
        resolve(server)
      },
    )
    server.once("error", reject)
  })
}
