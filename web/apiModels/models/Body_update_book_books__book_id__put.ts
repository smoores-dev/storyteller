/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { FormDataBookAuthor } from "./FormDataBookAuthor"

export type Body_update_book_books__book_id__put = {
  title: string
  authors: Array<FormDataBookAuthor>
  text_cover?: Blob | null
  audio_cover?: Blob | null
}
