import axios, { AxiosProgressEvent } from "axios"
import {
  Body_login_token_post,
  BookDetail,
  Invite,
  InviteAccept,
  InviteRequest,
  Settings,
  Token,
  User,
  UserRequest,
} from "./apiModels"

export class ApiClientError extends Error {
  constructor(
    public statusCode: number,
    public statusMessage: string,
  ) {
    const message = `${statusCode}: ${statusMessage}`
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

  getHeaders() {
    return this.accessToken === undefined
      ? {}
      : { Authorization: `Bearer ${this.accessToken}` }
  }

  getSyncedDownloadUrl(bookUuid: string) {
    return `${this.rootPath}/books/${bookUuid}/synced`
  }

  getCoverUrl(bookUuid: string, audio = false) {
    const searchParams = new URLSearchParams()
    if (audio) {
      searchParams.append("audio", "true")
    }
    return `${this.rootPath}/books/${bookUuid}/cover${searchParams.toString()}`
  }

  async needsInit(): Promise<boolean> {
    const url = new URL(`${this.rootPath}/needs-init`, this.origin)

    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(),
      credentials: "include",
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }

    return await response.json()
  }

  async login(creds: Body_login_token_post): Promise<Token> {
    const formData = new FormData()
    formData.set("username", creds.username)
    formData.set("password", creds.password)

    const url = new URL(`${this.rootPath}/token`, this.origin)

    const response = await fetch(url, {
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

  async createInvite(inviteRequest: InviteRequest): Promise<Invite> {
    const url = new URL(`${this.rootPath}/invites`, this.origin)

    const response = await fetch(url, {
      method: "POST",
      headers: { ...this.getHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(inviteRequest),
      credentials: "include",
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }

    const invite = (await response.json()) as Invite
    return invite
  }

  async getInvite(inviteKey: string): Promise<Invite> {
    const url = new URL(`${this.rootPath}/invites/${inviteKey}`, this.origin)

    const response = await fetch(url)

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }

    const invite = (await response.json()) as Invite
    return invite
  }

  async acceptInvite(inviteAccept: InviteAccept): Promise<Token> {
    const url = new URL(`${this.rootPath}/users`, this.origin)

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(inviteAccept),
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }

    const token = (await response.json()) as Token
    return token
  }

  async listUsers(): Promise<User[]> {
    const url = new URL(`${this.rootPath}/users`, this.origin)

    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(),
      credentials: "include",
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }

    const users = (await response.json()) as User[]
    return users
  }

  async createAdminUser(userRequest: UserRequest): Promise<Token> {
    const url = new URL(`${this.rootPath}/users/admin`, this.origin)

    const response = await fetch(url, {
      method: "POST",
      headers: { ...this.getHeaders(), "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(userRequest),
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }

    const token = (await response.json()) as Token
    return token
  }

  async getCurrentUser(): Promise<User> {
    const url = new URL(`${this.rootPath}/user`, this.origin)

    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(),
      credentials: "include",
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }

    const user = (await response.json()) as User
    return user
  }

  async getSettings(): Promise<Settings> {
    const url = new URL(`${this.rootPath}/settings`, this.origin)

    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(),
      credentials: "include",
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }

    const settings = (await response.json()) as Settings
    return settings
  }

  async updateSettings(settings: Settings) {
    const url = new URL(`${this.rootPath}/settings`, this.origin)

    const response = await fetch(url, {
      method: "PUT",
      headers: { ...this.getHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(settings),
      credentials: "include",
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }
  }

  async deleteBook(bookUuid: string): Promise<void> {
    const url = new URL(`${this.rootPath}/books/${bookUuid}`, this.origin)

    const response = await fetch(url, {
      method: "DELETE",
      headers: this.getHeaders(),
      credentials: "include",
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }
  }

  async listBooks(): Promise<BookDetail[]> {
    const url = new URL(`${this.rootPath}/books`, this.origin)

    const response = await fetch(url, {
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
    onUploadProgress: (progressEvent: AxiosProgressEvent) => void,
  ): Promise<BookDetail> {
    const url = new URL(`${this.rootPath}/books/epub`, this.origin)

    const response = await axios.postForm<BookDetail>(
      url.toString(),
      { file },
      { withCredentials: true, onUploadProgress },
    )

    if (response.status > 299) {
      throw new ApiClientError(response.status, response.statusText)
    }

    const book = response.data
    return book
  }

  async uploadBookAudio(
    bookUuid: string,
    files: FileList,
    onUploadProgress: (progressEvent: AxiosProgressEvent) => void,
  ): Promise<void> {
    const url = new URL(`${this.rootPath}/books/${bookUuid}/audio`, this.origin)

    const response = await axios.postForm<BookDetail>(
      url.toString(),
      { files },
      {
        formSerializer: { indexes: null },
        withCredentials: true,
        onUploadProgress,
      },
    )

    if (response.status > 299) {
      throw new ApiClientError(response.status, response.statusText)
    }
  }

  async uploadBookCover(
    bookUuid: string,
    file: File,
    onUploadProgress: (progressEvent: AxiosProgressEvent) => void,
  ): Promise<void> {
    const url = new URL(`${this.rootPath}/books/${bookUuid}/cover`, this.origin)

    const response = await axios.postForm<BookDetail>(
      url.toString(),
      { file },
      { withCredentials: true, onUploadProgress },
    )

    if (response.status > 299) {
      throw new ApiClientError(response.status, response.statusText)
    }
  }

  async processBook(bookUuid: string, restart?: boolean): Promise<void> {
    const url = new URL(
      `${this.rootPath}/books/${bookUuid}/process`,
      this.origin,
    )
    if (restart) {
      url.search = new URLSearchParams({ restart: "true" }).toString()
    }

    const response = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(),
      credentials: "include",
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }
  }

  async getBookDetails(bookUuid: string): Promise<BookDetail> {
    const url = new URL(`${this.rootPath}/books/${bookUuid}`, this.origin)

    const response = await fetch(url, {
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
