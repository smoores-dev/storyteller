import { buildAllBooks } from "@/opds/builders"
import { handleOpds, opdsOptions } from "@/opds/respond"

export const dynamic = "force-dynamic"

export const GET = handleOpds((ctx) => buildAllBooks(ctx))

export const OPTIONS = opdsOptions
