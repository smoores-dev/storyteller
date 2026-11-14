import { z } from "zod"

export const API_TOKEN_ACCESS = ["reading", "full"] as const

export const API_TOKEN_EXPIRATIONS = [
  "7d",
  "30d",
  "90d",
  "1y",
  "never",
] as const

export type ApiTokenExpiration = (typeof API_TOKEN_EXPIRATIONS)[number]

export const ApiTokenCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  access: z.enum(API_TOKEN_ACCESS),
  expiration: z.enum(API_TOKEN_EXPIRATIONS),
})

export type ApiTokenCreate = z.infer<typeof ApiTokenCreateSchema>
