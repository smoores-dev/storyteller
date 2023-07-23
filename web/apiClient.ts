import axios, { AxiosProgressEvent } from "axios"
import { Body_login_token_post, BookDetail, Token } from "./apiModels"

export class ApiClientError extends Error {
  constructor(public statusCode: number, public statusMessage: string) {
    const message = `${statusCode}: ${statusMessage}`
    super(message)
    this.name = "ApiClientError"
  }
}

export class ApiClient {
  constructor(private apiHost: string, private accessToken?: string) {}

  getHeaders() {
    return this.accessToken === undefined
      ? {}
      : { Authorization: `Bearer ${this.accessToken}` }
  }

  getSyncedDownloadUrl() {
    const url = new URL("/token", this.apiHost)

    return url.toString()
  }

  async login(creds: Body_login_token_post): Promise<Token> {
    const formData = new FormData()
    formData.set("username", creds.username)
    formData.set("password", creds.password)

    const url = new URL("/token", this.apiHost)

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: this.getHeaders(),
      credentials: "include",
      cache: "no-store",
      body: formData,
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }

    const token = (await response.json()) as Token
    return token
  }

  async listBooks(): Promise<BookDetail[]> {
    const url = new URL("/books", this.apiHost)

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: this.getHeaders(),
      credentials: "include",
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }

    const books = (await response.json()) as BookDetail[]
    return books
  }

  async uploadBookEpub(
    file: File,
    onUploadProgress: (progressEvent: AxiosProgressEvent) => void
  ): Promise<BookDetail> {
    const url = new URL("/books/epub", this.apiHost)

    const response = await axios.postForm<BookDetail>(
      url.toString(),
      { file },
      { withCredentials: true, onUploadProgress }
    )

    if (response.status > 299) {
      throw new ApiClientError(response.status, response.statusText)
    }

    const book = response.data
    return book
  }

  async uploadBookAudio(
    bookId: number,
    file: File,
    onUploadProgress: (progressEvent: AxiosProgressEvent) => void
  ): Promise<void> {
    const url = new URL(`/books/${bookId}/audio`, this.apiHost)

    const response = await axios.postForm<BookDetail>(
      url.toString(),
      { file },
      { withCredentials: true, onUploadProgress }
    )

    if (response.status > 299) {
      throw new ApiClientError(response.status, response.statusText)
    }
  }

  async processBook(bookId: number): Promise<void> {
    const url = new URL(`/books/${bookId}/process`, this.apiHost)

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: this.getHeaders(),
      credentials: "include",
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }
  }

  async getBookDetails(bookId: number): Promise<BookDetail> {
    const url = new URL(`/books/${bookId}`, this.apiHost)

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: this.getHeaders(),
      credentials: "include",
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }

    const book = (await response.json()) as BookDetail
    return book
  }
}
