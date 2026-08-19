import z from "zod"

import { type UUID } from "@/uuid"

export const uuidv4 = z
  .uuidv4()
  .meta({ description: "UUID v4" }) as z.ZodType<UUID>
