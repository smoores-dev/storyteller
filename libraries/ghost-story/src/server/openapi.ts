import { zValidator } from "@hono/zod-validator"
import { createOpenApiMiddleware } from "hono-zod-openapi"
import { HTTPException } from "hono/http-exception"
import { z } from "zod/v4"

import { errorSchema } from "./protocol.ts"

export const openApi: ReturnType<typeof createOpenApiMiddleware> =
  createOpenApiMiddleware((target, schema) =>
    zValidator(target, schema, (result) => {
      if (!result.success) {
        throw new HTTPException(400, { message: z.prettifyError(result.error) })
      }
    }),
  )

export const errorResponses = {
  401: {
    description: "The request did not send the server's API key.",
    schema: errorSchema,
  },
  500: { description: "The server failed.", schema: errorSchema },
}

export function error(description: string) {
  return { description, schema: errorSchema }
}

export const binary = { type: "string", format: "binary" } as const
