/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { BookAuthor } from "./BookAuthor"
import type { ProcessingStatus } from "./ProcessingStatus"

export type BookDetail = {
  id: number
  title: string
  authors: Array<BookAuthor>
  processing_status: ProcessingStatus | null
}
