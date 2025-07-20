/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { BookWithRelations } from "@/database/books"

export type BookDetail = BookWithRelations & {
  processingStatus: "queued" | "processing" | null
}
