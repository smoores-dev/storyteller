/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Body_create_book_books_post } from "../models/Body_create_book_books_post"
import type { Body_login_token_post } from "../models/Body_login_token_post"
import type { Body_update_book_books__book_id__put } from "../models/Body_update_book_books__book_id__put"
import type { Body_upload_book_cover_books__book_id__cover_post } from "../models/Body_upload_book_cover_books__book_id__cover_post"
import type { BookDetail } from "../models/BookDetail"
import type { Invite } from "../models/Invite"
import type { InviteAccept } from "../models/InviteAccept"
import type { InviteRequest } from "../models/InviteRequest"
import type { Settings } from "../models/Settings"
import type { Token } from "../models/Token"
import type { User } from "../models/User"
import type { UserRequest } from "../models/UserRequest"

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
   * Needs Init
   * @returns any Successful Response
   * @throws ApiError
   */
  public static needsInitNeedsInitGet(): CancelablePromise<any> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/needs-init",
    })
  }

  /**
   * Login
   * @param formData
   * @returns Token Successful Response
   * @throws ApiError
   */
  public static loginTokenPost(
    formData: Body_login_token_post,
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
   * Logout
   * @returns any Successful Response
   * @throws ApiError
   */
  public static logoutLogoutPost(): CancelablePromise<any> {
    return __request(OpenAPI, {
      method: "POST",
      url: "/logout",
    })
  }

  /**
   * Validate Token
   * @returns string Successful Response
   * @throws ApiError
   */
  public static validateTokenValidateGet(): CancelablePromise<string> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/validate",
    })
  }

  /**
   * List Users
   * @returns User Successful Response
   * @throws ApiError
   */
  public static listUsersUsersGet(): CancelablePromise<Array<User>> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/users",
    })
  }

  /**
   * Accept Invite
   * @param requestBody
   * @returns Token Successful Response
   * @throws ApiError
   */
  public static acceptInviteUsersPost(
    requestBody: InviteAccept,
  ): CancelablePromise<Token> {
    return __request(OpenAPI, {
      method: "POST",
      url: "/users",
      body: requestBody,
      mediaType: "application/json",
      errors: {
        422: `Validation Error`,
      },
    })
  }

  /**
   * Get Invites
   * @returns Invite Successful Response
   * @throws ApiError
   */
  public static getInvitesInvitesGet(): CancelablePromise<Array<Invite>> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/invites",
    })
  }

  /**
   * Create Invite
   * @param requestBody
   * @returns Invite Successful Response
   * @throws ApiError
   */
  public static createInviteInvitesPost(
    requestBody: InviteRequest,
  ): CancelablePromise<Invite> {
    return __request(OpenAPI, {
      method: "POST",
      url: "/invites",
      body: requestBody,
      mediaType: "application/json",
      errors: {
        422: `Validation Error`,
      },
    })
  }

  /**
   * Get Invite
   * @param inviteKey
   * @returns Invite Successful Response
   * @throws ApiError
   */
  public static getInviteInvitesInviteKeyGet(
    inviteKey: string,
  ): CancelablePromise<Invite> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/invites/{invite_key}",
      path: {
        invite_key: inviteKey,
      },
      errors: {
        422: `Validation Error`,
      },
    })
  }

  /**
   * Create Admin
   * @param requestBody
   * @returns Token Successful Response
   * @throws ApiError
   */
  public static createAdminUsersAdminPost(
    requestBody: UserRequest,
  ): CancelablePromise<Token> {
    return __request(OpenAPI, {
      method: "POST",
      url: "/users/admin",
      body: requestBody,
      mediaType: "application/json",
      errors: {
        422: `Validation Error`,
      },
    })
  }

  /**
   * Delete User
   * @param userUuid
   * @returns any Successful Response
   * @throws ApiError
   */
  public static deleteUserUsersUserUuidDelete(
    userUuid: string,
  ): CancelablePromise<any> {
    return __request(OpenAPI, {
      method: "DELETE",
      url: "/users/{user_uuid}",
      path: {
        user_uuid: userUuid,
      },
      errors: {
        422: `Validation Error`,
      },
    })
  }

  /**
   * Get Current User
   * @returns User Successful Response
   * @throws ApiError
   */
  public static getCurrentUserUserGet(): CancelablePromise<User> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/user",
    })
  }

  /**
   * Get Settings
   * @returns Settings Successful Response
   * @throws ApiError
   */
  public static getSettingsSettingsGet(): CancelablePromise<Settings> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/settings",
    })
  }

  /**
   * Update Settings
   * @param requestBody
   * @returns any Successful Response
   * @throws ApiError
   */
  public static updateSettingsSettingsPut(
    requestBody: Settings,
  ): CancelablePromise<any> {
    return __request(OpenAPI, {
      method: "PUT",
      url: "/settings",
      body: requestBody,
      mediaType: "application/json",
      errors: {
        422: `Validation Error`,
      },
    })
  }

  /**
   * List Books
   * @param synced
   * @returns BookDetail Successful Response
   * @throws ApiError
   */
  public static listBooksBooksGet(
    synced?: any,
  ): CancelablePromise<Array<BookDetail>> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/books",
      query: {
        synced: synced,
      },
      errors: {
        422: `Validation Error`,
      },
    })
  }

  /**
   * Create Book
   * @param formData
   * @returns BookDetail Successful Response
   * @throws ApiError
   */
  public static createBookBooksPost(
    formData: Body_create_book_books_post,
  ): CancelablePromise<BookDetail> {
    return __request(OpenAPI, {
      method: "POST",
      url: "/books",
      formData: formData,
      mediaType: "multipart/form-data",
      errors: {
        422: `Validation Error`,
      },
    })
  }

  /**
   * Update Book
   * @param bookId
   * @param formData
   * @returns BookDetail Successful Response
   * @throws ApiError
   */
  public static updateBookBooksBookIdPut(
    bookId: string,
    formData: Body_update_book_books__book_id__put,
  ): CancelablePromise<BookDetail> {
    return __request(OpenAPI, {
      method: "PUT",
      url: "/books/{book_id}",
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
   * Get Book Details
   * @param bookId
   * @returns BookDetail Successful Response
   * @throws ApiError
   */
  public static getBookDetailsBooksBookIdGet(
    bookId: string,
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
   * Delete Book
   * @param bookId
   * @returns any Successful Response
   * @throws ApiError
   */
  public static deleteBookBooksBookIdDelete(
    bookId: string,
  ): CancelablePromise<any> {
    return __request(OpenAPI, {
      method: "DELETE",
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
   * Process Book
   * @param bookId
   * @param restart
   * @returns any Successful Response
   * @throws ApiError
   */
  public static processBookBooksBookIdProcessPost(
    bookId: string,
    restart: boolean = false,
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
   * Get Synced Book
   * @param bookId
   * @param range
   * @param ifRange
   * @returns any Successful Response
   * @throws ApiError
   */
  public static getSyncedBookBooksBookIdSyncedGet(
    bookId: string,
    range?: string | null,
    ifRange?: string | null,
  ): CancelablePromise<any> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/books/{book_id}/synced",
      path: {
        book_id: bookId,
      },
      headers: {
        range: range,
        "if-range": ifRange,
      },
      errors: {
        422: `Validation Error`,
      },
    })
  }

  /**
   * Get Book Cover
   * @param bookId
   * @param audio
   * @returns any Successful Response
   * @throws ApiError
   */
  public static getBookCoverBooksBookIdCoverGet(
    bookId: any,
    audio: boolean = false,
  ): CancelablePromise<any> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/books/{book_id}/cover",
      path: {
        book_id: bookId,
      },
      query: {
        audio: audio,
      },
      errors: {
        422: `Validation Error`,
      },
    })
  }

  /**
   * Upload Book Cover
   * @param bookId
   * @param formData
   * @returns any Successful Response
   * @throws ApiError
   */
  public static uploadBookCoverBooksBookIdCoverPost(
    bookId: string,
    formData: Body_upload_book_cover_books__book_id__cover_post,
  ): CancelablePromise<any> {
    return __request(OpenAPI, {
      method: "POST",
      url: "/books/{book_id}/cover",
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
}
