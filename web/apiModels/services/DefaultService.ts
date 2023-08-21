/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Body_login_token_post } from "../models/Body_login_token_post"
import type { Body_upload_audio_books__book_id__audio_post } from "../models/Body_upload_audio_books__book_id__audio_post"
import type { Body_upload_epub_books_epub_post } from "../models/Body_upload_epub_books_epub_post"
import type { BookDetail } from "../models/BookDetail"
import type { Token } from "../models/Token"

import type { CancelablePromise } from "../core/CancelablePromise"
import { OpenAPI } from "../core/OpenAPI"
import { request as __request } from "../core/request"

export class DefaultService {
  /**
   * Index
   * @returns any Successful Response
   * @throws ApiError
   */
  public static indexGet(): CancelablePromise<any> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/",
    })
  }

  /**
   * Login
   * @param formData
   * @returns Token Successful Response
   * @throws ApiError
   */
  public static loginTokenPost(
    formData: Body_login_token_post
  ): CancelablePromise<Token> {
    return __request(OpenAPI, {
      method: "POST",
      url: "/token",
      formData: formData,
      mediaType: "application/x-www-form-urlencoded",
      errors: {
        422: `Validation Error`,
      },
    })
  }

  /**
   * List Books
   * @returns BookDetail Successful Response
   * @throws ApiError
   */
  public static listBooksBooksGet(): CancelablePromise<Array<BookDetail>> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/books",
    })
  }

  /**
   * Upload Epub
   * @param formData
   * @returns BookDetail Successful Response
   * @throws ApiError
   */
  public static uploadEpubBooksEpubPost(
    formData: Body_upload_epub_books_epub_post
  ): CancelablePromise<BookDetail> {
    return __request(OpenAPI, {
      method: "POST",
      url: "/books/epub",
      formData: formData,
      mediaType: "multipart/form-data",
      errors: {
        422: `Validation Error`,
      },
    })
  }

  /**
   * Upload Audio
   * @param bookId
   * @param formData
   * @returns any Successful Response
   * @throws ApiError
   */
  public static uploadAudioBooksBookIdAudioPost(
    bookId: number,
    formData: Body_upload_audio_books__book_id__audio_post
  ): CancelablePromise<any> {
    return __request(OpenAPI, {
      method: "POST",
      url: "/books/{book_id}/audio",
      path: {
        book_id: bookId,
      },
      formData: formData,
      mediaType: "multipart/form-data",
      errors: {
        422: `Validation Error`,
      },
    })
  }

  /**
   * Process Book
   * @param bookId
   * @param restart
   * @returns any Successful Response
   * @throws ApiError
   */
  public static processBookBooksBookIdProcessPost(
    bookId: number,
    restart?: any
  ): CancelablePromise<any> {
    return __request(OpenAPI, {
      method: "POST",
      url: "/books/{book_id}/process",
      path: {
        book_id: bookId,
      },
      query: {
        restart: restart,
      },
      errors: {
        422: `Validation Error`,
      },
    })
  }

  /**
   * Get Book Details
   * @param bookId
   * @returns BookDetail Successful Response
   * @throws ApiError
   */
  public static getBookDetailsBooksBookIdGet(
    bookId: number
  ): CancelablePromise<BookDetail> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/books/{book_id}",
      path: {
        book_id: bookId,
      },
      errors: {
        422: `Validation Error`,
      },
    })
  }

  /**
   * Get Synced Book
   * @param bookId
   * @returns any Successful Response
   * @throws ApiError
   */
  public static getSyncedBookBooksBookIdSyncedGet(
    bookId: any
  ): CancelablePromise<any> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/books/{book_id}/synced",
      path: {
        book_id: bookId,
      },
      errors: {
        422: `Validation Error`,
      },
    })
  }
}
