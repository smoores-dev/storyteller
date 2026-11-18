import Link from "@docusaurus/Link"
import CodeBlock from "@theme/CodeBlock"
import Layout from "@theme/Layout"
import React, {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  useCallback,
  useRef,
  useState,
} from "react"

import styles from "./opds-validator.module.css"

interface ValidationError {
  path: string
  message: string
  keyword: string
}

type InputMode = "upload" | "url"

type ValidationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "valid"; feed: Record<string, unknown> }
  | {
      status: "invalid"
      errors: ValidationError[]
      feed: Record<string, unknown>
    }
  | { status: "error"; message: string }

const importValidator = () =>
  import("@storyteller/opds/validate").then((mod) => mod.validateFeed)

const SPEC_URL = "https://specs.opds.io/opds-2.0"
const SOURCE_URL =
  "https://gitlab.com/storyteller-platform/storyteller/-/blob/main/docs/src/pages/tools/opds-validator.tsx"

function resolveLocalizedString(value: unknown): string | undefined {
  if (typeof value === "string") return value

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.values(value as Record<string, unknown>)
    const first = entries[0]
    if (typeof first === "string") return first
  }

  return undefined
}

function resolveContributor(value: unknown): string | undefined {
  if (!value) return undefined

  if (typeof value === "string") return value

  if (Array.isArray(value)) {
    return value
      .map((c) => resolveContributor(c))
      .filter(Boolean)
      .join(", ")
  }

  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>
    return resolveLocalizedString(record.name) ?? undefined
  }

  return undefined
}

function FeedPreview({ feed }: { feed: Record<string, unknown> }) {
  const metadata = feed.metadata as Record<string, unknown> | undefined
  const publications = feed.publications as
    | Record<string, unknown>[]
    | undefined
  const navigation = feed.navigation as unknown[] | undefined
  const groups = feed.groups as Record<string, unknown>[] | undefined

  const title = metadata ? resolveLocalizedString(metadata.title) : undefined

  const numberOfItems = metadata?.numberOfItems as number | undefined
  const itemsPerPage = metadata?.itemsPerPage as number | undefined
  const currentPage = metadata?.currentPage as number | undefined

  return (
    <div className={styles.feedPreview}>
      <h3 className={styles.feedTitle}>{title ?? "Untitled Feed"}</h3>

      <div className={styles.feedStats}>
        {publications && (
          <span className={styles.stat}>
            {publications.length} publication
            {publications.length !== 1 ? "s" : ""}
          </span>
        )}

        {navigation && (
          <span className={styles.stat}>
            {navigation.length} navigation link
            {navigation.length !== 1 ? "s" : ""}
          </span>
        )}

        {groups && (
          <span className={styles.stat}>
            {groups.length} group{groups.length !== 1 ? "s" : ""}
          </span>
        )}

        {numberOfItems != null && (
          <span className={styles.stat}>
            {numberOfItems} total item
            {numberOfItems !== 1 ? "s" : ""}
          </span>
        )}

        {itemsPerPage != null && (
          <span className={styles.stat}>{itemsPerPage} per page</span>
        )}

        {currentPage != null && (
          <span className={styles.stat}>page {currentPage}</span>
        )}
      </div>

      {publications && publications.length > 0 && (
        <div className={styles.publicationList}>
          <h4>Publications</h4>
          <div className={styles.publicationGrid}>
            {publications.slice(0, 20).map((pub, i) => {
              const pubMeta = pub.metadata as
                | Record<string, unknown>
                | undefined
              const pubTitle = pubMeta
                ? resolveLocalizedString(pubMeta.title)
                : undefined
              const author = pubMeta
                ? resolveContributor(pubMeta.author)
                : undefined

              const images = pub.images as { href?: string }[] | undefined
              const coverHref = images?.[0]?.href

              return (
                <div key={i} className={styles.publicationCard}>
                  {coverHref && (
                    <img
                      src={coverHref}
                      alt=""
                      className={styles.publicationCover}
                      loading="lazy"
                    />
                  )}
                  <div className={styles.publicationInfo}>
                    <span className={styles.publicationTitle}>
                      {pubTitle ?? "Untitled"}
                    </span>
                    {author && (
                      <span className={styles.publicationAuthor}>{author}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {publications.length > 20 && (
            <p className={styles.truncated}>
              Showing 20 of {publications.length} publications
            </p>
          )}
        </div>
      )}

      <p className={styles.feedDisclaimer}>
        This preview is not a full OPDS client implementation. It only shows
        basic feed information to help confirm your feed is working. Cover
        images may not load if they require authentication, and pagination or
        link navigation is not supported.
      </p>
    </div>
  )
}

function ErrorTable({ errors }: { errors: ValidationError[] }) {
  return (
    <div className={styles.errorTableWrapper}>
      <table className={styles.errorTable}>
        <thead>
          <tr>
            <th>Path</th>
            <th>Message</th>
            <th>Rule</th>
          </tr>
        </thead>
        <tbody>
          {errors.map((error, i) => (
            <tr key={i}>
              <td>
                <code>{error.path}</code>
              </td>
              <td>{error.message}</td>
              <td>
                <span className={styles.badge}>{error.keyword}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function OPDSValidatorPage(): JSX.Element {
  const [mode, setMode] = useState<InputMode>("upload")
  const [state, setState] = useState<ValidationState>({ status: "idle" })
  const [showRawJson, setShowRawJson] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)

  const validateJson = useCallback(async (json: unknown) => {
    setState({ status: "loading" })

    try {
      const validateFeed = await importValidator()
      const errors = validateFeed(json)

      const feed = json as Record<string, unknown>

      if (errors == null || errors.length === 0) {
        setState({ status: "valid", feed })
      } else {
        setState({ status: "invalid", errors, feed })
      }
    } catch (e) {
      setState({
        status: "error",
        message: e instanceof Error ? e.message : "validation failed",
      })
    }
  }, [])

  const handleFileUpload = useCallback(
    async (file: File) => {
      try {
        const text = await file.text()
        const json = JSON.parse(text)
        await validateJson(json)
      } catch {
        setState({
          status: "error",
          message:
            "could not parse the file as JSON. make sure it is a valid JSON document.",
        })
      }
    },
    [validateJson],
  )

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setDragActive(false)

      const file = e.dataTransfer.files[0]
      if (file) {
        void handleFileUpload(file)
      }
    },
    [handleFileUpload],
  )

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    setDragActive(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    setDragActive(false)
  }, [])

  const handleFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        void handleFileUpload(file)
      }
    },
    [handleFileUpload],
  )

  const handleUrlSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()

      const formData = new FormData(e.target as HTMLFormElement)
      const url = formData.get("url") as string
      const username = formData.get("username") as string
      const password = formData.get("password") as string

      if (!url) {
        setState({ status: "error", message: "please enter a URL" })
        return
      }

      setState({ status: "loading" })

      try {
        const headers: HeadersInit = {}

        if (username && password) {
          headers["Authorization"] = `Basic ${btoa(`${username}:${password}`)}`
        }

        const response = await fetch(url, { headers })

        if (!response.ok) {
          setState({
            status: "error",
            message: `HTTP ${response.status}: ${response.statusText}`,
          })

          return
        }

        const json = await response.json()
        await validateJson(json)
      } catch (e) {
        const isCors =
          e instanceof TypeError && e.message.includes("Failed to fetch")

        setState({
          status: "error",
          message: isCors
            ? "request failed, likely due to CORS restrictions. most OPDS servers do not allow browser requests. try downloading the feed JSON and uploading it instead."
            : e instanceof Error
              ? e.message
              : "failed to fetch feed",
        })
      }
    },
    [validateJson],
  )

  const handleReset = useCallback(() => {
    setState({ status: "idle" })
    setShowRawJson(false)

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }, [])

  const feed =
    state.status === "valid" || state.status === "invalid"
      ? state.feed
      : undefined

  return (
    <Layout
      title="OPDS 2.0 Validator"
      description="Validate your OPDS 2.0 catalog feed against the specification"
    >
      <main className="container">
        <div className={styles.page}>
          <header className={styles.header}>
            <h1>OPDS 2.0 Validator</h1>
            <p className={styles.description}>
              Validate your OPDS 2.0 catalog feed against the{" "}
              <Link to={SPEC_URL}>OPDS 2.0 specification</Link>. Upload a JSON
              file or fetch from a URL.
            </p>
          </header>

          <section className={styles.inputSection}>
            <ul className="tabs">
              <li
                className={`tabs__item ${mode === "upload" ? "tabs__item--active" : ""}`}
                onClick={() => setMode("upload")}
              >
                Upload file
              </li>
              <li
                className={`tabs__item ${mode === "url" ? "tabs__item--active" : ""}`}
                onClick={() => setMode("url")}
              >
                Fetch from URL
              </li>
            </ul>

            <div className={styles.inputContent}>
              {mode === "upload" ? (
                <div
                  className={`${styles.dropZone} ${dragActive ? styles.dropZoneActive : ""}`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileInputChange}
                    className={styles.fileInput}
                  />
                  <div className={styles.dropZoneContent}>
                    <svg
                      className={styles.uploadIcon}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span className={styles.dropZoneText}>
                      Drop a JSON file here, or click to browse
                    </span>
                    <span className={styles.dropZoneHint}>
                      Accepts .json files
                    </span>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleUrlSubmit} className={styles.urlForm}>
                  <div className={styles.formField}>
                    <label htmlFor="url">Feed URL</label>
                    <input
                      id="url"
                      type="url"
                      name="url"
                      defaultValue="https://test.opds.io/2.0/home.json"
                      className={styles.textInput}
                    />
                  </div>

                  <details className={styles.authDetails}>
                    <summary>Authentication (optional)</summary>
                    <div className={styles.authFields}>
                      <div className={styles.formField}>
                        <label htmlFor="username">Username</label>
                        <input
                          id="username"
                          type="text"
                          name="username"
                          placeholder="Username"
                          className={styles.textInput}
                        />
                      </div>
                      <div className={styles.formField}>
                        <label htmlFor="password">Password</label>
                        <input
                          id="password"
                          type="password"
                          name="password"
                          placeholder="Password"
                          className={styles.textInput}
                        />
                      </div>
                    </div>
                  </details>

                  <div className={styles.corsHint}>
                    Most OPDS servers do not allow direct browser requests due
                    to CORS. If fetching fails, try downloading the feed and
                    uploading it instead.
                  </div>

                  <div className={styles.privacyNotice}>
                    This tool runs entirely in your browser. Your credentials
                    are never sent to our servers (this is just a static page,
                    there&apos;s no server to send it to!).{" "}
                    <Link to={SOURCE_URL}>View the source code</Link> to verify.
                  </div>

                  <button
                    type="submit"
                    className="button button--primary"
                    disabled={state.status === "loading"}
                  >
                    {state.status === "loading" ? "Validating..." : "Validate"}
                  </button>
                </form>
              )}
            </div>
          </section>

          {state.status === "loading" && (
            <div className={styles.loading}>
              <div className={styles.spinner} />
              <span>Validating feed...</span>
            </div>
          )}

          {state.status === "error" && (
            <section className={styles.resultSection}>
              <div className="alert alert--danger">
                <button
                  className={styles.resetButton}
                  onClick={handleReset}
                  type="button"
                >
                  Clear
                </button>
                <strong>Error</strong>
                <p>{state.message}</p>
              </div>
            </section>
          )}

          {state.status === "valid" && (
            <section className={styles.resultSection}>
              <div className="alert alert--success">
                <button
                  className={styles.resetButton}
                  onClick={handleReset}
                  type="button"
                >
                  Clear
                </button>
                <strong>Valid OPDS 2.0 Feed</strong>
                <p>The feed conforms to the OPDS 2.0 specification.</p>
              </div>

              <FeedPreview feed={state.feed} />
            </section>
          )}

          {state.status === "invalid" && (
            <section className={styles.resultSection}>
              <div className="alert alert--warning">
                <button
                  className={styles.resetButton}
                  onClick={handleReset}
                  type="button"
                >
                  Clear
                </button>
                <strong>
                  {state.errors.length} validation error
                  {state.errors.length !== 1 ? "s" : ""}
                </strong>
                <p>
                  The feed does not fully conform to the OPDS 2.0 specification.
                </p>
              </div>

              <ErrorTable errors={state.errors} />

              <FeedPreview feed={state.feed} />
            </section>
          )}

          {feed && (
            <section className={styles.rawJsonSection}>
              <button
                type="button"
                className={`button button--secondary button--sm ${styles.toggleRawButton}`}
                onClick={() => setShowRawJson(!showRawJson)}
              >
                {showRawJson ? "Hide" : "Show"} raw JSON
              </button>

              {showRawJson && (
                <CodeBlock language="json">
                  {JSON.stringify(feed, null, 2)}
                </CodeBlock>
              )}
            </section>
          )}
        </div>
      </main>
    </Layout>
  )
}
