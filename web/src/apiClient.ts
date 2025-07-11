import axios, { AxiosProgressEvent } from "axios"
import {
  BookDetail,
  Invite,
  InviteAccept,
  InviteRequest,
  Settings,
  Token,
  User,
  UserRequest,
} from "./apiModels"
import { UserPermissionSet } from "./database/users"
import { AuthorRelation, Book, SeriesRelation } from "./database/books"
import { BookEvent } from "./events"
import { Status } from "./database/statuses"
import { Author } from "./database/authors"
import { Series } from "./database/series"
import { Collection } from "./database/collections"
import { UUID } from "./uuid"
import { PublicProvider } from "@auth/core/types"
import { Tag } from "./database/tags"

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

  getAlignedDownloadUrl(bookUuid: string) {
    return `${this.rootPath}/v2/books/${bookUuid}/aligned`
  }

  getCoverUrl(bookUuid: string, audio = false) {
    const searchParams = new URLSearchParams()
    if (audio) {
      searchParams.append("audio", "true")
    }
    return `${this.rootPath}/v2/books/${bookUuid}/cover?${searchParams.toString()}`
  }

  async needsInit(): Promise<boolean> {
    const url = new URL(`${this.rootPath}/v2/needs-init`, this.origin)

    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(),
      credentials: "include",
    })

    if (!response.ok) {
      if (response.status === 403) return false

      throw new ApiClientError(response.status, response.statusText)
    }

    return true
  }

  async login(creds: {
    usernameOrEmail: string
    password: string
  }): Promise<Token> {
    const formData = new FormData()
    formData.set("usernameOrEmail", creds.usernameOrEmail)
    formData.set("password", creds.password)

    const url = new URL(`${this.rootPath}/v2/token`, this.origin)

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

  async logout(): Promise<void> {
    const url = new URL(`${this.rootPath}/v2/logout`, this.origin)

    const response = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(),
      credentials: "include",
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }
  }

  async createInvite(inviteRequest: InviteRequest): Promise<Invite> {
    const url = new URL(`${this.rootPath}/v2/invites`, this.origin)

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

  async resendInvite(inviteKey: string): Promise<void> {
    const url = new URL(
      `${this.rootPath}/v2/invites/${inviteKey}/send`,
      this.origin,
    )

    const response = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(),
      credentials: "include",
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }
  }

  async getInvite(inviteKey: string): Promise<Invite> {
    const url = new URL(`${this.rootPath}/v2/invites/${inviteKey}`, this.origin)

    const response = await fetch(url, {
      headers: this.getHeaders(),
      credentials: "include",
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }

    const invite = (await response.json()) as Invite
    return invite
  }

  async deleteInvite(inviteKey: string): Promise<void> {
    const url = new URL(`${this.rootPath}/v2/invites/${inviteKey}`, this.origin)

    const response = await fetch(url, {
      method: "DELETE",
      headers: this.getHeaders(),
      credentials: "include",
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }
  }

  async listInvites(): Promise<Invite[]> {
    const url = new URL(`${this.rootPath}/v2/invites`, this.origin)

    const response = await fetch(url, {
      headers: this.getHeaders(),
      credentials: "include",
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }

    const invites = (await response.json()) as Invite[]
    return invites
  }

  async acceptInvite(inviteAccept: InviteAccept): Promise<Token | undefined> {
    const url = new URL(`${this.rootPath}/v2/users`, this.origin)

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

    if ("providerId" in inviteAccept) {
      return
    }
    const token = (await response.json()) as Token
    return token
  }

  async listUsers(): Promise<User[]> {
    const url = new URL(`${this.rootPath}/v2/users`, this.origin)

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
    const url = new URL(`${this.rootPath}/v2/users/admin`, this.origin)

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

  async deleteUser(uuid: string): Promise<void> {
    const url = new URL(`${this.rootPath}/v2/users/${uuid}`, this.origin)

    const response = await fetch(url, {
      method: "DELETE",
      headers: this.getHeaders(),
      credentials: "include",
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }
  }

  async updateUser(
    uuid: string,
    permissions: UserPermissionSet,
  ): Promise<void> {
    const url = new URL(`${this.rootPath}/v2/users/${uuid}`, this.origin)

    const response = await fetch(url, {
      method: "PUT",
      headers: this.getHeaders(),
      credentials: "include",
      body: JSON.stringify({ permissions }),
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }
  }

  async getCurrentUser(): Promise<User> {
    const url = new URL(`${this.rootPath}/v2/user`, this.origin)

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
    const url = new URL(`${this.rootPath}/v2/settings`, this.origin)

    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(),
      credentials: "include",
      cache: "no-cache",
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }

    const settings = (await response.json()) as Settings
    return settings
  }

  async updateSettings(settings: Settings) {
    const url = new URL(`${this.rootPath}/v2/settings`, this.origin)

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
    const url = new URL(`${this.rootPath}/v2/books/${bookUuid}`, this.origin)

    const response = await fetch(url, {
      method: "DELETE",
      headers: this.getHeaders(),
      credentials: "include",
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }
  }

  async deleteBookAssets(bookUuid: string, originals?: boolean): Promise<void> {
    const url = new URL(
      `${this.rootPath}/v2/books/${bookUuid}/cache`,
      this.origin,
    )
    if (originals) {
      url.searchParams.set("originals", "true")
    }

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
    const url = new URL(`${this.rootPath}/v2/books`, this.origin)

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
    const url = new URL(`${this.rootPath}/v2/books/epub`, this.origin)

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

  async createBook(epubFile: string, audioFiles: string[]): Promise<BookDetail>
  async createBook(
    epubFile: File,
    audioFiles: File[],
    onUploadProgress: (progressEvent: AxiosProgressEvent) => void,
  ): Promise<BookDetail>
  async createBook(
    epubFile: File | string,
    audioFiles: File[] | string[],
    onUploadProgress?: (progressEvent: AxiosProgressEvent) => void,
  ): Promise<BookDetail> {
    const url = new URL(`${this.rootPath}/v2/books/`, this.origin)

    if (typeof epubFile === "string" && Array.isArray(audioFiles)) {
      const response = await fetch(url, {
        method: "POST",
        headers: { ...this.getHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          epubPath: epubFile,
          audioPaths: audioFiles,
        }),
      })

      if (response.status > 299) {
        throw new ApiClientError(response.status, response.statusText)
      }

      return (await response.json()) as BookDetail
    }
    const response = await axios.postForm<BookDetail>(
      url.toString(),
      {
        epubFile: epubFile,
        audioFiles: audioFiles,
      },
      {
        formSerializer: { indexes: null },
        withCredentials: true,
        // If we get to the overload with Files rather than strings,
        // onUploadProgress is definitely provided
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        onUploadProgress: onUploadProgress!,
      },
    )

    if (response.status > 299) {
      throw new ApiClientError(response.status, response.statusText)
    }

    return response.data
  }

  async processBook(bookUuid: string, restart?: boolean): Promise<void> {
    const url = new URL(
      `${this.rootPath}/v2/books/${bookUuid}/process`,
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

  async cancelProcessing(bookUuid: string): Promise<void> {
    const url = new URL(
      `${this.rootPath}/v2/books/${bookUuid}/process`,
      this.origin,
    )

    const response = await fetch(url, {
      method: "DELETE",
      headers: this.getHeaders(),
      credentials: "include",
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }
  }

  async getBookDetails(bookUuid: string): Promise<BookDetail> {
    const url = new URL(`${this.rootPath}/v2/books/${bookUuid}`, this.origin)

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

  async updateBook(
    update: {
      uuid: Book["uuid"]
      title: Book["title"]
      language: Book["language"]
      statusUuid: Book["statusUuid"]
      publicationDate: Book["publicationDate"]
      authors: AuthorRelation[]
      series: SeriesRelation[]
      collections: UUID[]
      tags: string[]
    },
    textCover: File | null,
    audioCover: File | null,
  ): Promise<BookDetail> {
    const url = new URL(`${this.rootPath}/v2/books/${update.uuid}`, this.origin)

    const body = new FormData()
    body.append("title", update.title)
    if (update.language !== null) {
      body.append("language", update.language)
    }
    if (update.publicationDate) {
      body.append("publicationDate", update.publicationDate)
    }
    body.append("statusUuid", update.statusUuid)

    for (const tag of update.tags) {
      body.append("tags", tag)
    }

    for (const author of update.authors) {
      body.append("authors", JSON.stringify(author))
    }

    for (const series of update.series) {
      body.append("series", JSON.stringify(series))
    }

    for (const collection of update.collections) {
      body.append("collections", collection)
    }

    if (textCover !== null) {
      body.append("textCover", textCover)
    }

    if (audioCover !== null) {
      body.append("audioCover", audioCover)
    }

    const response = await fetch(url, {
      method: "PUT",
      headers: { ...this.getHeaders() },
      credentials: "include",
      body,
    })

    if (!response.ok) {
      console.error(await response.json())
      throw new ApiClientError(response.status, response.statusText)
    }

    const book = (await response.json()) as BookDetail
    return book
  }

  subscribeToBookEvents(listener: (event: BookEvent) => void) {
    const url = new URL(`${this.rootPath}/v2/books/events`, this.origin)
    const eventSource = new EventSource(url.toString())
    eventSource.addEventListener("message", (event: MessageEvent<string>) => {
      const parsedEvent = JSON.parse(event.data) as BookEvent
      listener(parsedEvent)
    })

    return () => {
      eventSource.close()
    }
  }

  async listStatuses() {
    const url = new URL(`${this.rootPath}/v2/statuses`, this.origin)
    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(),
      credentials: "include",
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }

    const statuses = (await response.json()) as Status[]
    return statuses
  }

  async listAuthors() {
    const url = new URL(`${this.rootPath}/v2/authors`, this.origin)
    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(),
      credentials: "include",
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }

    const authors = (await response.json()) as Author[]
    return authors
  }

  async listSeries() {
    const url = new URL(`${this.rootPath}/v2/series`, this.origin)
    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(),
      credentials: "include",
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }

    const series = (await response.json()) as Series[]
    return series
  }

  async listCollections() {
    const url = new URL(`${this.rootPath}/v2/collections`, this.origin)
    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(),
      credentials: "include",
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }

    const collections = (await response.json()) as Collection[]
    return collections
  }

  async getCollection(uuid: UUID) {
    const url = new URL(`${this.rootPath}/v2/collections/${uuid}`, this.origin)

    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(),
      credentials: "include",
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }

    const collection = (await response.json()) as Collection
    return collection
  }

  async updateCollection(
    uuid: UUID,
    update: {
      name?: string
      description?: string
      public?: boolean
      users?: UUID[]
      books?: UUID[]
    },
  ) {
    const url = new URL(`${this.rootPath}/v2/collections/${uuid}`, this.origin)

    const response = await fetch(url, {
      method: "PUT",
      headers: this.getHeaders(),
      credentials: "include",
      body: JSON.stringify(update),
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }

    const collection = (await response.json()) as Collection
    return collection
  }

  async addBooksToCollections(collections: UUID[], books: UUID[]) {
    const url = new URL(`${this.rootPath}/v2/collections/books`, this.origin)

    const response = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(),
      credentials: "include",
      body: JSON.stringify({
        collections,
        books,
      }),
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }
  }

  async removeBooksFromCollections(collections: UUID[], books: UUID[]) {
    const url = new URL(`${this.rootPath}/v2/collections/books`, this.origin)

    const response = await fetch(url, {
      method: "DELETE",
      headers: this.getHeaders(),
      credentials: "include",
      body: JSON.stringify({
        collections,
        books,
      }),
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }
  }

  async listTags() {
    const url = new URL(`${this.rootPath}/v2/tags`, this.origin)
    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(),
      credentials: "include",
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }

    const tags = (await response.json()) as Tag[]
    return tags
  }

  async createCollection(values: {
    name: string
    description: string
    public: boolean
    users: string[]
  }) {
    const url = new URL(`${this.rootPath}/v2/collections`, this.origin)

    const body = {
      name: values.name,
      description: values.description,
      public: values.public,
      ...(!values.public && { users: values.users }),
    }

    const response = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(),
      credentials: "include",
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }

    const collection = (await response.json()) as Collection
    return collection
  }

  async listProviders() {
    const url = new URL(`${this.rootPath}/v2/auth/providers`, this.origin)

    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(),
      credentials: "include",
    })

    if (!response.ok) {
      throw new ApiClientError(response.status, response.statusText)
    }

    const providers = (await response.json()) as Record<string, PublicProvider>
    return providers
  }
}
