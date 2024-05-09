import { Body_login_token_post, BookDetail, Token } from "./apiModels"
import { joinUrlPaths } from "./urls"

AbortSignal.timeout ??= function timeout(ms) {
  const ctrl = new AbortController()
  setTimeout(() => ctrl.abort(), ms)
  return ctrl.signal
}

export class ApiClientError extends Error {
  constructor(
    public path: string,
    public statusCode: number,
    public statusMessage: string,
  ) {
    const message = `${path} ${statusCode}: ${statusMessage}`
    super(message)
    this.name = "ApiClientError"
  }
}

export class ApiClient {
  constructor(
    private origin: string,
    private rootPath: string,
    private accessToken?: string,
  ) {}

  isAuthenticated(): boolean {
    return !!this.accessToken
  }

  getHeaders() {
    return this.accessToken === undefined
      ? {}
      : { Authorization: `Bearer ${this.accessToken}` }
  }

  getSyncedDownloadUrl(bookId: number) {
    const url = new URL(
      joinUrlPaths(this.rootPath, `/books/${bookId}/synced`),
      this.origin,
    )

    return url.toString()
  }

  getCoverUrl(bookId: number, audio = false) {
    const url = new URL(
      joinUrlPaths(this.rootPath, `/books/${bookId}/cover`),
      this.origin,
    )
    if (audio) url.searchParams.append("audio", "true")

    return url.toString()
  }

  async hello(): Promise<{ Hello: "World" }> {
    const url = new URL(`${this.rootPath}`, this.origin)

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: this.getHeaders(),
      credentials: "include",
    })

    if (!response.ok) {
      throw new ApiClientError(
        url.toString(),
        response.status,
        response.statusText,
      )
    }

    const helloWorld = (await response.json()) as { Hello: "World" }
    return helloWorld
  }

  async login(creds: Body_login_token_post): Promise<Token> {
    const formData = new FormData()
    formData.append("username", creds.username)
    formData.append("password", creds.password)

    const url = new URL(joinUrlPaths(this.rootPath, "/token"), this.origin)

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: this.getHeaders(),
      credentials: "include",
      cache: "no-store",
      body: formData,
    })

    if (!response.ok) {
      throw new ApiClientError(
        url.toString(),
        response.status,
        response.statusText,
      )
    }

    const token = (await response.json()) as Token
    return token
  }

  async listBooks(): Promise<BookDetail[]> {
    const url = new URL(joinUrlPaths(this.rootPath, "/books"), this.origin)
    // The mobile apps only ever need fully synced
    // books
    url.searchParams.append("synced", "true")

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: this.getHeaders(),
      credentials: "include",
    })

    if (!response.ok) {
      throw new ApiClientError(
        url.toString() + " " + JSON.stringify(this.getHeaders()),
        response.status,
        response.statusText,
      )
    }

    const books = (await response.json()) as BookDetail[]
    return books
  }

  async getBookDetails(bookId: number): Promise<BookDetail> {
    const url = new URL(
      joinUrlPaths(this.rootPath, `books/${bookId}`),
      this.origin,
    )

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: this.getHeaders(),
      credentials: "include",
    })

    if (!response.ok) {
      throw new ApiClientError(
        url.toString(),
        response.status,
        response.statusText,
      )
    }

    const book = (await response.json()) as BookDetail
    return book
  }

  async validateToken(): Promise<boolean> {
    const url = new URL(joinUrlPaths(this.rootPath, "/validate"), this.origin)

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: this.getHeaders(),
      credentials: "include",
      signal: AbortSignal.timeout(5000),
    })

    if (response.status === 401 || response.status === 403) {
      return false
    }

    if (!response.ok) {
      throw new ApiClientError(
        url.toString(),
        response.status,
        response.statusText,
      )
    }

    return true
  }
}
