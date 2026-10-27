import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, it, vi } from "vitest"

import {
  GitLabClient,
  GitLabError,
  RateLimitError,
  messageFromBody,
} from "../gitlab/client"
import {
  RateLimitMonitor,
  Semaphore,
  parseRetryAfter,
} from "../gitlab/rateLimit"
import { fileToBase64 } from "../images/naming"
import {
  MISSING_BASE,
  emptyChangeset,
  toCommitActions,
  withBinaryChange,
  withTextChange,
} from "../model/changeset"
import { findProblems } from "../model/commitFailure"
import { findConflicts } from "../model/conflicts"
import type { SidebarOutline } from "../model/outline"
import {
  type SidebarJsonItem,
  referencedIds,
  renameDocId,
  sidebarDestinations,
} from "../model/sidebars"
import {
  decisionFor,
  parseVersionFile,
  serializeVersionFile,
  touchedLibraries,
  versionFileName,
  withDecision,
} from "../model/versionFile"
import {
  exportChangesZip,
  exportDraft,
  importDraft,
  mergeDraft,
  zipFileName,
} from "../storage/backup"
import {
  DraftPersistence,
  MemoryDraftBackend,
  fromLegacyDraft,
  joinDraft,
  splitDraft,
} from "../storage/drafts"
import { crc32 } from "../storage/zip"
import { FileTree } from "../ui/FileTree"
import { sidebarModelKey } from "../ui/sidebarModels"

const here = dirname(fileURLToPath(import.meta.url))

function png(bytes: number[]) {
  return new Blob([new Uint8Array(bytes)], { type: "image/png" })
}

function quotaError() {
  const error = new Error("The quota has been exceeded.")
  error.name = "QuotaExceededError"
  return error
}

describe("draft storage", () => {
  it("keeps images as blobs and only writes the ones that changed", () => {
    const first = png([1, 2, 3])
    let data = emptyChangeset(7, "docs/x", null)
    data = withTextChange(data, "a.md", "hello", MISSING_BASE)
    data = withBinaryChange(data, "img/a.png", first)
    const initial = splitDraft(data, new Map(), 10)
    assert.deepEqual([...initial.write.putBlobs.keys()], ["img/a.png"])
    assert.equal(initial.write.record.changes["img/a.png"]?.kind, "binary")

    const unchanged = splitDraft(data, initial.nextSaved, 11)
    assert.equal(unchanged.write.putBlobs.size, 0)
    assert.deepEqual(unchanged.write.removeBlobs, [])

    const swapped = withBinaryChange(data, "img/a.png", png([9]))
    assert.deepEqual(
      [...splitDraft(swapped, initial.nextSaved, 12).write.putBlobs.keys()],
      ["img/a.png"],
    )

    const dropped = { ...data, changes: { "a.md": data.changes["a.md"]! } }
    assert.deepEqual(
      splitDraft(dropped, initial.nextSaved, 13).write.removeBlobs,
      ["img/a.png"],
    )

    const joined = joinDraft(
      initial.write.record,
      new Map([["img/a.png", first]]),
    )
    const image = joined.changes["img/a.png"]
    assert.equal(image?.kind === "binary" && image.blob, first)
  })

  it("saves, survives a full browser, and retries", async () => {
    const backend = new MemoryDraftBackend()
    const persistence = new DraftPersistence(backend, 0)
    let data = emptyChangeset(1, "docs/x", null)
    data = withTextChange(data, "a.md", "hello", MISSING_BASE)

    backend.failWith = quotaError()
    persistence.schedule(data)
    await persistence.flush()
    const state = persistence.getState()
    assert.equal(state.status, "error")
    assert.equal(state.status === "error" && state.quota, true)
    assert.equal(persistence.hasUnsavedWork(), true)
    assert.equal(backend.records.size, 0)

    backend.failWith = null
    assert.equal(await persistence.retry(), true)
    assert.equal(persistence.getState().status, "saved")
    assert.equal(persistence.hasUnsavedWork(), false)
    assert.equal(backend.records.size, 1)

    const reloaded = await new DraftPersistence(backend, 0).load(1, "docs/x")
    assert.equal(reloaded.changes["a.md"]?.kind, "text")

    persistence.schedule({ ...data, changes: {} })
    await persistence.flush()
    assert.equal(backend.records.size, 0)
  })

  it("migrates a legacy localStorage draft and normalizes empty commit ids", async () => {
    const store = new Map<string, string>()
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    })
    const legacy = {
      version: 1,
      projectId: 5,
      branch: "docs/y",
      headSha: null,
      createdAt: 1,
      changes: {
        "static/img/a.png": {
          kind: "binary",
          base64: "AQID",
          mime: "image/png",
          base: { content: null, lastCommitId: "" },
        },
        "a.md": {
          kind: "text",
          content: "x",
          base: { content: "w", lastCommitId: "c1" },
        },
      },
    }
    store.set("studio:draft:5:docs/y", JSON.stringify(legacy))
    const backend = new MemoryDraftBackend()
    const loaded = await new DraftPersistence(backend, 0).load(5, "docs/y")
    const image = loaded.changes["static/img/a.png"]
    assert.equal(image?.kind, "binary")
    assert.equal(image?.base.lastCommitId, null)
    assert.equal(image?.kind === "binary" && image.blob.size, 3)
    assert.equal(backend.records.size, 1)
    assert.equal(store.has("studio:draft:5:docs/y"), false)
    vi.unstubAllGlobals()
  })

  it("keeps a legacy draft in localStorage when it cannot be moved", async () => {
    const store = new Map<string, string>()
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    })
    store.set(
      "studio:draft:5:docs/y",
      JSON.stringify({
        version: 1,
        changes: { "a.md": { kind: "text", content: "x", base: MISSING_BASE } },
      }),
    )
    const backend = new MemoryDraftBackend()
    backend.failWith = quotaError()
    const loaded = await new DraftPersistence(backend, 0).load(5, "docs/y")
    assert.equal(Object.keys(loaded.changes).length, 1)
    assert.equal(store.has("studio:draft:5:docs/y"), true)
    vi.unstubAllGlobals()
  })
})

describe("backups", () => {
  it("round trips a draft with images", async () => {
    let data = emptyChangeset(1, "docs/x", null)
    data = withTextChange(data, "a.md", "hello", MISSING_BASE)
    data = withBinaryChange(data, "img/a.png", png([1, 2, 3, 250]))
    const text = await exportDraft(data)
    const restored = importDraft(text, 1, "docs/x")
    assert.deepEqual(Object.keys(restored.changes).sort(), [
      "a.md",
      "img/a.png",
    ])
    const image = restored.changes["img/a.png"]
    assert.deepEqual(
      image?.kind === "binary"
        ? [...new Uint8Array(await image.blob.arrayBuffer())]
        : null,
      [1, 2, 3, 250],
    )
    const merged = mergeDraft(emptyChangeset(1, "docs/x", null), restored)
    assert.equal(Object.keys(merged.changes).length, 2)
  })

  it("restores what the console extractor and old localStorage produce", () => {
    const old = {
      version: 1,
      projectId: 67994333,
      branch: "docs/jess-v3",
      changes: {
        "applications/docs/docs/welcome.md": {
          kind: "text",
          content: "# hi",
          base: { content: "old", lastCommitId: "abc" },
        },
      },
    }
    const restored = importDraft(JSON.stringify(old), 1, "docs/other")
    assert.equal(restored.branch, "docs/other")
    assert.equal(
      restored.changes["applications/docs/docs/welcome.md"]?.base.lastCommitId,
      "abc",
    )
    assert.throws(() => importDraft("not json", 1, "b"), /not a docs studio/)
    assert.throws(
      () => importDraft(JSON.stringify({ changes: {} }), 1, "b"),
      /does not contain/,
    )
    assert.equal(fromLegacyDraft(null, 1, "b"), null)
  })

  it("encodes binaries into commit actions", async () => {
    let data = emptyChangeset(1, "b", null)
    data = withBinaryChange(data, "img/a.png", png([1, 2, 3]))
    const encoded = new Map([["img/a.png", await fileToBase64(png([1, 2, 3]))]])
    assert.deepEqual(toCommitActions(data, encoded), [
      {
        action: "create",
        file_path: "img/a.png",
        content: "AQID",
        encoding: "base64",
        last_commit_id: undefined,
      },
    ])
  })
})

describe("zip export", () => {
  async function readZip(blob: Blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const view = new DataView(bytes.buffer)
    const decoder = new TextDecoder()
    const count = view.getUint16(bytes.length - 22 + 10, true)
    let position = view.getUint32(bytes.length - 22 + 16, true)
    const files = new Map<string, { text: string; crcOk: boolean }>()
    for (let index = 0; index < count; index++) {
      assert.equal(view.getUint32(position, true), 0x02014b50)
      const crc = view.getUint32(position + 16, true)
      const size = view.getUint32(position + 20, true)
      const nameLength = view.getUint16(position + 28, true)
      const local = view.getUint32(position + 42, true)
      const name = decoder.decode(
        bytes.subarray(position + 46, position + 46 + nameLength),
      )
      const start = local + 30 + view.getUint16(local + 26, true)
      const data = bytes.subarray(start, start + size)
      files.set(name, {
        text: decoder.decode(data),
        crcOk: crc32(data) === crc,
      })
      position += 46 + nameLength
    }

    return files
  }

  it("holds every changed file at its repo path with a readme", async () => {
    let data = emptyChangeset(1, "docs/jess-v3", "abc123")
    data = withTextChange(data, "applications/docs/docs/a.md", "# Ünïcode\n", {
      content: "old",
      lastCommitId: "c1",
    })
    data = withTextChange(
      data,
      "applications/docs/docs/b.md",
      "new",
      MISSING_BASE,
    )
    data = withBinaryChange(
      data,
      "applications/docs/static/img/p.png",
      png([1, 2, 3, 250]),
      MISSING_BASE,
    )
    data.changes["applications/docs/docs/gone.md"] = {
      kind: "delete",
      base: { content: "x", lastCommitId: "c2" },
    }
    const files = await readZip(
      await exportChangesZip(data, new Date("2026-10-27T15:00:00Z")),
    )
    assert.deepEqual([...files.keys()].sort(), [
      "README.txt",
      "files/applications/docs/docs/a.md",
      "files/applications/docs/docs/b.md",
      "files/applications/docs/static/img/p.png",
    ])
    assert.equal(
      files.get("files/applications/docs/docs/a.md")?.text,
      "# Ünïcode\n",
    )
    for (const file of files.values()) {
      assert.equal(file.crcOk, true)
    }

    const readme = files.get("README.txt")!.text
    assert.match(readme, /Branch:\s+docs\/jess-v3/)
    assert.match(readme, /Based on:\s+abc123/)
    assert.match(readme, /deleted\s+applications\/docs\/docs\/gone.md/)
    assert.match(readme, /edited\s+applications\/docs\/docs\/a.md/)
    assert.equal(
      zipFileName("docs/jess-v3", new Date("2026-10-27T15:00:00Z")),
      "docs-studio-docs-jess-v3-2026-10-27-15-00.zip",
    )
  })
})

describe("the console extractor for the deployed build", () => {
  const source = readFileSync(
    join(here, "../../recovery/extract-draft-console.js"),
    "utf8",
  ).replace(/^;/, "")
  function run(root: unknown) {
    const clicked: string[] = []
    const run = new Function(
      "document",
      "window",
      "URL",
      "Blob",
      "console",
      `return ${source}`,
    )
    const result = run(
      {
        querySelector: () => root,
        createElement: () => ({
          click() {
            clicked.push("download")
          },
          remove() {},
        }),
        body: { appendChild() {} },
      },
      {},
      { createObjectURL: () => "blob:x" },
      class {},
      { log() {} },
    )
    return { result, clicked }
  }

  it("finds the draft in the hook state above the root element", () => {
    const draft = {
      version: 1,
      projectId: 1,
      branch: "docs/x",
      changes: { "a.md": { kind: "text" }, "b.md": { kind: "text" } },
    }
    const empty = { version: 1, projectId: 1, branch: "docs/x", changes: {} }
    const hooks = {
      memoizedState: 4,
      next: {
        memoizedState: empty,
        next: { memoizedState: draft, next: null },
      },
    }
    const studio = { memoizedState: hooks, return: null }
    const root = { __reactFiber$abc: { memoizedState: null, return: studio } }
    const { result, clicked } = run(root)
    assert.deepEqual(result, ["a.md", "b.md"])
    assert.deepEqual(clicked, ["download"])
  })

  it("says so when there is nothing in memory", () => {
    const root = {
      __reactFiber$abc: { memoizedState: null, return: null },
    }
    assert.throws(() => run(root), /no unsaved changes/)
  })
})

describe("rate limits", () => {
  it("counts requests in a rolling hour", () => {
    let now = 1_000_000
    const monitor = new RateLimitMonitor(100, () => now, false)
    for (let i = 0; i < 5; i++) {
      monitor.record()
    }

    assert.equal(monitor.getSnapshot().used, 5)
    now += 30 * 60_000
    monitor.record()
    assert.equal(monitor.getSnapshot().used, 6)
    now += 31 * 60_000
    monitor.record()
    assert.equal(monitor.getSnapshot().used, 2)
  })

  it("reads retry hints", () => {
    assert.equal(
      parseRetryAfter(new Headers({ "retry-after": "30" }), 1000),
      31_000,
    )
    assert.equal(
      parseRetryAfter(new Headers({ "ratelimit-reset": "2000" }), 0),
      2_000_000,
    )
    assert.equal(parseRetryAfter(new Headers(), 0), null)
  })

  it("limits concurrency", async () => {
    const semaphore = new Semaphore(2)
    let active = 0
    let peak = 0
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        const release = await semaphore.acquire()
        active += 1
        peak = Math.max(peak, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1
        release()
      }),
    )
    assert.equal(peak, 2)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("stops asking GitLab after a long rate limit and reports when it ends", async () => {
    const fetchStub = vi.fn(async () =>
      Response.json(
        { message: "Retry later" },
        { status: 429, headers: { "retry-after": "600" } },
      ),
    )
    vi.stubGlobal("fetch", fetchStub)
    const monitor = new RateLimitMonitor(100, Date.now, false)
    const client = new GitLabClient({
      baseUrl: "https://gitlab.test",
      getToken: async () => null,
      monitor,
    })
    await assert.rejects(client.getProject(1), (error: unknown) => {
      assert.ok(error instanceof RateLimitError)
      assert.ok((error.resetAt ?? 0) > Date.now() + 500_000)
      return true
    })
    await assert.rejects(client.getProject(2), RateLimitError)
    assert.equal(fetchStub.mock.calls.length, 1)
  })

  it("names the request and reads GitLab's own message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { message: "A file with this name doesn't exist" },
          { status: 400 },
        ),
      ),
    )
    const client = new GitLabClient({
      baseUrl: "https://gitlab.test",
      getToken: async () => null,
      monitor: new RateLimitMonitor(100, Date.now, false),
    })
    await assert.rejects(
      client.commit(1, { branch: "b", commit_message: "m", actions: [] }),
      (error: unknown) => {
        assert.ok(error instanceof GitLabError)
        assert.equal(error.message, "A file with this name doesn't exist")
        assert.equal(error.request.method, "POST")
        assert.match(error.request.path, /repository\/commits/)
        return true
      },
    )
  })

  it("flattens validation errors", () => {
    assert.equal(
      messageFromBody({ message: { name: ["is taken", "is bad"] } }, 400, ""),
      "name is taken, is bad",
    )
    assert.equal(messageFromBody(null, 500, "Server Error"), "500 Server Error")
  })
})

describe("commit problems", () => {
  function fakeClient(files: string[]) {
    return {
      fileExists: async (_project: number, _ref: string, path: string) =>
        files.includes(path),
      lastCommitFor: async (_p: number, _r: string, path: string) =>
        files.includes(path) ? "c9" : null,
      getFile: async () => ({ content: "theirs" }),
    } as unknown as GitLabClient
  }

  it("names the file GitLab could not find", async () => {
    const problems = await findProblems(fakeClient(["b.md"]), 1, "docs/x", [
      { action: "update", file_path: "a.md", content: "x" },
      { action: "update", file_path: "b.md", content: "x" },
      { action: "delete", file_path: "gone.png" },
      { action: "create", file_path: "b.md", content: "x" },
    ])
    assert.deepEqual(
      problems.map((problem) => problem.path),
      ["a.md", "gone.png", "b.md"],
    )
    assert.match(problems[0]!.problem, /does not exist on docs\/x/)
    assert.match(problems[2]!.problem, /already exists/)
  })

  it("flags a new file that already exists on the branch as a conflict", async () => {
    let data = emptyChangeset(1, "docs/x", null)
    data = withTextChange(data, "new.md", "mine", MISSING_BASE)
    data = withTextChange(data, "fresh.md", "mine", MISSING_BASE)
    const conflicts = await findConflicts(
      fakeClient(["new.md"]),
      1,
      "docs/x",
      data,
    )
    assert.deepEqual(
      conflicts.map((conflict) => conflict.repoPath),
      ["new.md"],
    )
    assert.equal(conflicts[0]!.theirsCommit, "c9")
  })

  it("flags an edit to a file that no longer exists", async () => {
    let data = emptyChangeset(1, "docs/x", null)
    data = withTextChange(data, "old.md", "mine", {
      content: "was",
      lastCommitId: "c1",
    })
    const conflicts = await findConflicts(fakeClient([]), 1, "docs/x", data)
    assert.equal(conflicts.length, 1)
    assert.equal(conflicts[0]!.theirsCommit, null)
  })
})

describe("version files", () => {
  const text = [
    "releases:",
    '  "@storyteller-platform/opds": patch',
    '  "@storyteller-platform/web": major',
    "",
    "declined:",
    '  - "@storyteller-platform/docs"',
    "",
  ].join("\n")

  it("parses and writes the yarn format", () => {
    const parsed = parseVersionFile(text)
    assert.equal(decisionFor(parsed, "@storyteller-platform/web"), "major")
    assert.equal(decisionFor(parsed, "@storyteller-platform/docs"), "none")
    assert.equal(decisionFor(parsed, "@storyteller-platform/mobile"), null)
    assert.equal(serializeVersionFile(parsed), text)
  })

  it("changes a decision from release to none and back", () => {
    let decisions = parseVersionFile("")
    decisions = withDecision(decisions, "@a/docs", "patch")
    assert.equal(
      serializeVersionFile(decisions),
      'releases:\n  "@a/docs": patch\n',
    )
    decisions = withDecision(decisions, "@a/docs", "none")
    assert.equal(serializeVersionFile(decisions), 'declined:\n  - "@a/docs"\n')
    decisions = withDecision(decisions, "@a/docs", "minor")
    assert.equal(
      serializeVersionFile(decisions),
      'releases:\n  "@a/docs": minor\n',
    )
  })

  it("names the file after the branch and finds touched libraries", async () => {
    const name = await versionFileName("docs/jess-v3")
    assert.match(name, /^\.yarn\/versions\/[0-9a-f]{8}\.yml$/)
    assert.equal(name, await versionFileName("docs/jess-v3"))
    assert.notEqual(name, await versionFileName("docs/other"))
    assert.deepEqual(
      touchedLibraries([
        "libraries/epub/README.md",
        "libraries/epub/x.md",
        "applications/docs/docs/a.md",
        "libraries/align/README.md",
      ]),
      ["align", "epub"],
    )
  })
})

describe("the sidebar view", () => {
  it("offers a new page next to new category", () => {
    const version = {
      pluginId: "default",
      version: "current",
      label: "3.0",
      title: "Docs 3.0",
      contentPath: "docs",
      sidebarFile: "sidebars.json",
      manual: true,
      className: "docs-v3",
      isLast: false,
      sidebars: {},
      docs: [
        {
          id: "welcome",
          file: "docs/welcome.md",
          editFile: null,
          title: "Welcome",
          sidebar: "sidebar",
          unlisted: false,
        },
      ],
    } as unknown as SidebarOutline["versions"][number]
    const html = renderToStaticMarkup(
      React.createElement(FileTree, {
        files: [],
        selected: null,
        changed: new Set<string>(),
        deleted: new Set<string>(),
        newFiles: [],
        outline: { versions: [version] },
        models: [
          {
            key: sidebarModelKey(version),
            version,
            repoPath: "applications/docs/sidebars.json",
            base: MISSING_BASE,
            sidebars: {
              sidebar: [
                "welcome",
                { type: "category", label: "Guide", items: ["welcome"] },
              ],
            },
            local: false,
          },
        ],
        view: "sidebar",
        onViewChange: () => undefined,
        onSelect: () => undefined,
        onSidebarEdit: () => undefined,
        onNewPage: () => undefined,
        showImages: false,
      }),
    )
    assert.match(html, /New page here/)
    assert.match(html, /New category inside/)
    assert.match(html, /Move to another category/)
  })

  it("renames a doc id everywhere it is referenced", () => {
    const items: SidebarJsonItem[] = [
      "old/page",
      { type: "doc", id: "old/page", label: "Old" },
      {
        type: "category",
        label: "Guide",
        link: { type: "doc", id: "old/page" },
        items: ["other", "old/page"],
      },
    ]
    const renamed = renameDocId(items, "old/page", "new/page")
    assert.deepEqual(renamed, [
      "new/page",
      { type: "doc", id: "new/page", label: "Old" },
      {
        type: "category",
        label: "Guide",
        link: { type: "doc", id: "new/page" },
        items: ["other", "new/page"],
      },
    ])
    assert.equal(referencedIds(renamed).has("old/page"), false)
  })

  it("lists the top level and every category as a destination", () => {
    const items: SidebarJsonItem[] = [
      "a",
      {
        type: "category",
        label: "Guide",
        items: ["b", { type: "category", label: "Deep", items: [] }],
      },
    ]
    assert.deepEqual(sidebarDestinations(items, "docs", "Top level"), [
      { sidebarId: "docs", path: [2], label: "Top level", depth: 0 },
      { sidebarId: "docs", path: [1, 2], label: "Guide", depth: 1 },
      { sidebarId: "docs", path: [1, 1, 0], label: "Deep", depth: 2 },
    ])
  })
})
