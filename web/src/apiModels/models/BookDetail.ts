/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { BookWithRelations } from "@/database/books"

export type BookDetail = BookWithRelations & {
  originalFilesExist: boolean
  processingStatus: "queued" | "processing" | null
}
