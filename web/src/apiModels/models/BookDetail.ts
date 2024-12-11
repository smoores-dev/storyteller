/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { BookAuthor } from "./BookAuthor"
import type { ProcessingStatus } from "./ProcessingStatus"

export type BookDetail = {
  uuid: string
  id: number | null
  title: string
  language: string | null
  authors: Array<BookAuthor>
  original_files_exist: boolean
  processing_status: ProcessingStatus | null
}
