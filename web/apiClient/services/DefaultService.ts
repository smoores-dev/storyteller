/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Body_login_token_post } from "../models/Body_login_token_post"
import type { Body_upload_audio_books__book_id__audio_post } from "../models/Body_upload_audio_books__book_id__audio_post"
import type { Body_upload_epub_books_epub_post } from "../models/Body_upload_epub_books_epub_post"
import type { BookDetail } from "../models/BookDetail"
import type { Token } from "../models/Token"
import type { User } from "../models/User"

import type { CancelablePromise } from "../core/CancelablePromise"
import type { BaseHttpRequest } from "../core/BaseHttpRequest"

export class DefaultService {
  constructor(public readonly httpRequest: BaseHttpRequest) {}

  /**
   * Index
   * @returns any Successful Response
   * @throws ApiError
   */
  public indexGet(): CancelablePromise<any> {
    return this.httpRequest.request({
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
  public loginTokenPost(
    formData: Body_login_token_post
  ): CancelablePromise<Token> {
    return this.httpRequest.request({
      method: "POST",
      url: "/token",
      formData: formData,
      mediaType: "application/x-www-form-urlencoded",
      errors: {
        422: `Validation Error`,
      },
      cache: "no-store",
    })
  }

  /**
   * Read Users Me
   * @returns User Successful Response
   * @throws ApiError
   */
  public readUsersMeUsersMeGet(): CancelablePromise<User> {
    return this.httpRequest.request({
      method: "GET",
      url: "/users/me",
    })
  }

  /**
   * List Books
   * @returns BookDetail Successful Response
   * @throws ApiError
   */
  public listBooksBooksGet(): CancelablePromise<Array<BookDetail>> {
    return this.httpRequest.request({
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
  public uploadEpubBooksEpubPost(
    formData: Body_upload_epub_books_epub_post
  ): CancelablePromise<BookDetail> {
    return this.httpRequest.request({
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
  public uploadAudioBooksBookIdAudioPost(
    bookId: number,
    formData: Body_upload_audio_books__book_id__audio_post
  ): CancelablePromise<any> {
    return this.httpRequest.request({
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
   * @returns any Successful Response
   * @throws ApiError
   */
  public processBookBooksBookIdProcessPost(
    bookId: number
  ): CancelablePromise<any> {
    return this.httpRequest.request({
      method: "POST",
      url: "/books/{book_id}/process",
      path: {
        book_id: bookId,
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
  public getBookDetailsBooksBookIdGet(
    bookId: number
  ): CancelablePromise<BookDetail> {
    return this.httpRequest.request({
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
  public getSyncedBookBooksBookIdSyncedGet(
    bookId: any
  ): CancelablePromise<any> {
    return this.httpRequest.request({
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
