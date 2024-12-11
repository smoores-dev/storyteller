/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Parses a JSON-encoded book author from a
 * multipart/form-data-encoded request
 */
export type FormDataBookAuthor = {
  uuid: string
  name: string
  file_as: string
  role: string | null
}
