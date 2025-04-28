/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { getBook } from "@/database/books"

export type BookDetail = Awaited<ReturnType<typeof getBook>> & {
  originalFilesExist: boolean
  processingStatus: "queued" | "processing" | null
}
