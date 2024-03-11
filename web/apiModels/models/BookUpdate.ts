/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { BookAuthor } from "./BookAuthor"

export type BookUpdate = {
  title: string
  authors: Array<BookAuthor>
  text_cover: Blob | null
  audio_cover: Blob | null
}
