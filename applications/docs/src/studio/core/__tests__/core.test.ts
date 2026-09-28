import assert from "node:assert/strict"

import { describe, it } from "vitest"

import {
  type StudioConfig,
  buildLocationSearch,
  joinPath,
  parseLocation,
  rebaseRelativeLinks,
  relativePath,
  resolveAssetRepoPath,
  resolveLinkTarget,
} from "../config"
import { computeLineDiff } from "../diff/lines"
import { parseDocument, titleOf, withFrontmatter } from "../frontmatter"
import {
  customDestination,
  imageDestinations,
  relativeUrl,
  suggestImageName,
} from "../images/naming"
import {
  MISSING_BASE,
  emptyChangeset,
  toCommitActions,
  withDeletion,
  withMove,
  withTextChange,
} from "../model/changeset"
import {
  type SidebarJsonItem,
  docIdForFile,
  fileForDocId,
  getAt,
  insertAt,
  itemLabel,
  moveItem,
  parseSidebars,
  referencedIds,
  removeAt,
  serializeSidebars,
  updateAt,
} from "../model/sidebars"
import { suggestBranchName } from "../model/workspace"

const config: StudioConfig = {
  gitlab: { baseUrl: "https://gitlab.com", projectPath: "a/b", appId: null },
  defaultBranch: "main",
  docsRoot: "applications/docs",
  contentRoots: ["docs", "contributing", "blog"],
  staticRoot: "static",
  editPath: "/edit",
}

describe("config", () => {
  it("joins and normalizes paths", () => {
    assert.equal(joinPath("docs/managing", "./x.png"), "docs/managing/x.png")
    assert.equal(joinPath("docs/managing", "../sts.png"), "docs/sts.png")
    assert.equal(joinPath("a", "", "b/"), "a/b")
  })

  it("resolves asset urls to repo paths", () => {
    assert.equal(
      resolveAssetRepoPath(config, "docs/managing/aligning.md", "./x.png"),
      "applications/docs/docs/managing/x.png",
    )
    assert.equal(
      resolveAssetRepoPath(
        config,
        "docs/reading/web-reader.md",
        "/img/pwa.png",
      ),
      "applications/docs/static/img/pwa.png",
    )
    assert.equal(
      resolveAssetRepoPath(config, "docs/a.md", "https://example.com/x.png"),
      null,
    )
  })

  it("round-trips locations without encoding slashes", () => {
    const location = parseLocation(
      "?file=docs/managing/adding.md&branch=docs/x&mode=view",
      config,
    )
    assert.deepEqual(location, {
      file: "docs/managing/adding.md",
      branch: "docs/x",
      mode: "view",
      project: null,
    })
    assert.equal(
      buildLocationSearch(location, config),
      "?branch=docs/x&file=docs/managing/adding.md",
    )
    assert.equal(
      buildLocationSearch(
        { ...location, branch: "main", mode: "edit" },
        config,
      ),
      "?mode=edit&file=docs/managing/adding.md",
    )
    assert.equal(parseLocation("?file=a.md", config).mode, "view")
  })

  it("builds relative links between pages", () => {
    assert.equal(
      relativePath("docs/managing/adding.md", "docs/managing/removing.md"),
      "./removing.md",
    )
    assert.equal(
      relativePath("docs/managing/adding.md", "docs/reading/web.md"),
      "../reading/web.md",
    )
    assert.equal(
      relativePath("docs/intro.md", "docs/managing/a.md"),
      "./managing/a.md",
    )
    assert.equal(
      relativePath("docs/a/b/c.md", "contributing/x.md"),
      "../../../contributing/x.md",
    )
  })

  it("resolves link targets against known files", () => {
    const known = new Set(["docs/managing/adding.md", "docs/intro.md"])
    assert.deepEqual(
      resolveLinkTarget("docs/managing/removing.md", "adding.md#top", known),
      { file: "docs/managing/adding.md", hash: "top" },
    )
    assert.deepEqual(
      resolveLinkTarget("docs/managing/removing.md", "intro.md", known),
      { file: "docs/intro.md", hash: null },
    )
    assert.equal(
      resolveLinkTarget("docs/a.md", "https://example.com/x.md", known),
      null,
    )
    assert.equal(resolveLinkTarget("docs/a.md", "#section", known), null)
  })
})

describe("changeset", () => {
  it("drops a text change that matches the base", () => {
    const base = { content: "hello", lastCommitId: "abc" }
    let data = emptyChangeset(1, "main", null)
    data = withTextChange(data, "p.md", "hello world", base)
    assert.equal(Object.keys(data.changes).length, 1)
    data = withTextChange(data, "p.md", "hello", base)
    assert.equal(Object.keys(data.changes).length, 0)
  })

  it("maps changes to commit actions", () => {
    let data = emptyChangeset(1, "main", null)
    data = withTextChange(data, "new.md", "x", MISSING_BASE)
    data = withTextChange(data, "old.md", "y", {
      content: "z",
      lastCommitId: "c1",
    })
    data = withDeletion(data, "gone.md", { content: "q", lastCommitId: "c2" })
    assert.deepEqual(toCommitActions(data), [
      { action: "delete", file_path: "gone.md", last_commit_id: "c2" },
      {
        action: "create",
        file_path: "new.md",
        content: "x",
        last_commit_id: undefined,
      },
      {
        action: "update",
        file_path: "old.md",
        content: "y",
        last_commit_id: "c1",
      },
    ])
  })
})

describe("image naming", () => {
  const file = (name: string, type = "image/png") =>
    new File([new Uint8Array([1, 2, 3])], name, { type })

  it("suggests names from the clipboard name or the page", () => {
    assert.equal(
      suggestImageName(
        file("Screenshot 2026-08-22.png"),
        "docs/managing/aligning.md",
        new Set(),
      ),
      "aligning.png",
    )
    assert.equal(
      suggestImageName(
        file("library view.png"),
        "docs/managing/aligning.md",
        new Set(),
      ),
      "library-view.png",
    )
    assert.equal(
      suggestImageName(
        file("image.png"),
        "docs/managing/aligning.md",
        new Set(["aligning.png"]),
      ),
      "aligning-2.png",
    )
  })

  it("computes destinations and markdown urls", () => {
    const [beside, fixed] = imageDestinations(
      config,
      "docs/managing/aligning.md",
      "x.png",
    )
    assert.deepEqual(beside, {
      kind: "beside",
      repoPath: "applications/docs/docs/managing/x.png",
      markdownUrl: "./x.png",
    })
    assert.deepEqual(fixed, {
      kind: "static",
      repoPath: "applications/docs/static/img/x.png",
      markdownUrl: "/img/x.png",
    })
    assert.equal(
      customDestination(
        config,
        "docs/managing/aligning.md",
        "x.png",
        "docs/assets",
      ).markdownUrl,
      "../assets/x.png",
    )
    assert.equal(
      customDestination(
        config,
        "docs/managing/aligning.md",
        "x.png",
        "static/screens",
      ).markdownUrl,
      "/screens/x.png",
    )
    assert.equal(relativeUrl("docs/managing", "docs/managing/x.png"), "./x.png")
    assert.equal(relativeUrl("docs", "docs/managing/x.png"), "./managing/x.png")
  })
})

describe("diff", () => {
  it("reports changed line ranges on both sides", () => {
    const diff = computeLineDiff("a\nb\nc\n", "a\nB\nc\nd\n")
    assert.equal(diff.added, 2)
    assert.equal(diff.removed, 1)
    assert.deepEqual(diff.changedOld, [{ start: 2, end: 2 }])
    assert.deepEqual(diff.changedNew, [
      { start: 2, end: 2 },
      { start: 4, end: 4 },
    ])
  })
})

describe("frontmatter", () => {
  it("parses and rewrites frontmatter", () => {
    const source = "---\ntitle: Hi\nsidebar_position: 2\n---\n\n# Hi\n\nbody\n"
    const parsed = parseDocument(source)
    assert.deepEqual(parsed.frontmatter, { title: "Hi", sidebar_position: 2 })
    assert.equal(parsed.body, "\n# Hi\n\nbody\n")
    assert.equal(titleOf(source, "fallback"), "Hi")
    assert.equal(titleOf("# Heading\n", "fallback"), "Heading")
    assert.equal(titleOf("plain", "fallback"), "fallback")
    assert.equal(
      withFrontmatter(source, { title: "New", sidebar_position: 2 }),
      "---\ntitle: New\nsidebar_position: 2\n---\n\n# Hi\n\nbody\n",
    )
    assert.equal(withFrontmatter("body\n", {}), "body\n")
  })
})

describe("branch names", () => {
  it("slugifies the seed", () => {
    assert.equal(
      suggestBranchName("gpu-configuration.mdx"),
      "docs/gpu-configuration",
    )
    assert.equal(suggestBranchName("Some Page!.md"), "docs/some-page")
  })
})

describe("rebaseRelativeLinks", () => {
  it("rewrites relative links when the directory changes", () => {
    const source =
      "See [adding](adding.md#top) and ![shot](./shot.png) or [abs](/docs/x) and [ext](https://a.b/c.md)."
    assert.equal(
      rebaseRelativeLinks(
        source,
        "docs/managing/old.md",
        "docs/reading/new.md",
      ),
      "See [adding](../managing/adding.md#top) and ![shot](../managing/shot.png) or [abs](/docs/x) and [ext](https://a.b/c.md).",
    )
  })
  it("leaves content alone for a rename in place", () => {
    assert.equal(
      rebaseRelativeLinks("[a](b.md)", "docs/a.md", "docs/c.md"),
      "[a](b.md)",
    )
  })
})

describe("withMove", () => {
  const base = { content: "hello", lastCommitId: "abc" }
  it("records a move with content and produces a move action", () => {
    const data = withMove(
      emptyChangeset(1, "b", null),
      "a.md",
      "b/a.md",
      "hello",
      base,
    )
    assert.deepEqual(toCommitActions(data), [
      {
        action: "move",
        file_path: "b/a.md",
        previous_path: "a.md",
        content: "hello",
        last_commit_id: "abc",
      },
    ])
  })
  it("keeps edits made after the move and drops a move back", () => {
    let data = withMove(
      emptyChangeset(1, "b", null),
      "a.md",
      "b/a.md",
      "hello",
      base,
    )
    data = withTextChange(data, "b/a.md", "changed", MISSING_BASE)
    assert.equal(data.changes["b/a.md"]?.kind, "move")
    data = withMove(data, "b/a.md", "a.md", "changed", MISSING_BASE)
    assert.deepEqual(Object.keys(data.changes), ["a.md"])
    assert.equal(data.changes["a.md"]?.kind, "text")
    data = withMove(data, "a.md", "c.md", "hello", base)
    data = withMove(data, "c.md", "a.md", "hello", MISSING_BASE)
    assert.deepEqual(data.changes, {})
  })
  it("rekeys a new file instead of moving it", () => {
    let data = withTextChange(
      emptyChangeset(1, "b", null),
      "new.md",
      "x",
      MISSING_BASE,
    )
    data = withMove(data, "new.md", "dir/new.md", "x", MISSING_BASE)
    assert.equal(data.changes["dir/new.md"]?.kind, "text")
    assert.equal(data.changes["new.md"], undefined)
  })
  it("turns deleting a moved file into deleting the original", () => {
    let data = withMove(
      emptyChangeset(1, "b", null),
      "a.md",
      "b.md",
      "hello",
      base,
    )
    data = withDeletion(data, "b.md", MISSING_BASE)
    assert.deepEqual(Object.keys(data.changes), ["a.md"])
    assert.equal(data.changes["a.md"]?.kind, "delete")
  })
})

describe("sidebars model", () => {
  const items: SidebarJsonItem[] = [
    "welcome",
    { type: "category", label: "Install", items: ["install/a", "install/b"] },
    "settings",
  ]
  it("maps files to doc ids and back", () => {
    assert.equal(
      docIdForFile("docs", "docs/01-intro/02-start.md"),
      "intro/start",
    )
    assert.equal(docIdForFile("docs", "docs/guide/x.mdx"), "guide/x")
    assert.equal(docIdForFile("docs", "blog/x.md"), null)
    assert.equal(
      fileForDocId("docs", "guide/x", ["docs/guide/x.mdx", "docs/other.md"]),
      "docs/guide/x.mdx",
    )
  })
  it("collects referenced ids", () => {
    assert.deepEqual([...referencedIds(items)].sort(), [
      "install/a",
      "install/b",
      "settings",
      "welcome",
    ])
  })
  it("moves items within and across parents with index correction", () => {
    assert.deepEqual(moveItem(items, [0], [3]), [
      { type: "category", label: "Install", items: ["install/a", "install/b"] },
      "settings",
      "welcome",
    ])
    assert.deepEqual(moveItem(items, [2], [0]), [
      "settings",
      "welcome",
      { type: "category", label: "Install", items: ["install/a", "install/b"] },
    ])
    const into = moveItem(items, [2], [1, 0])
    assert.deepEqual(into, [
      "welcome",
      {
        type: "category",
        label: "Install",
        items: ["settings", "install/a", "install/b"],
      },
    ])
    const out = moveItem(into, [1, 0], [2])
    assert.deepEqual(out, items)
    assert.deepEqual(moveItem(items, [1], [1, 0]), items)
  })
  it("inserts, removes and updates", () => {
    const added = insertAt(items, [1, 2], "install/c")
    assert.equal(getAt(added, [1, 2]), "install/c")
    const { items: removed, removed: taken } = removeAt(added, [0])
    assert.equal(taken, "welcome")
    assert.equal(removed.length, 2)
    const renamed = updateAt(items, [1], (item) =>
      typeof item === "string" ? item : { ...item, label: "Setup" },
    )
    assert.equal(itemLabel(renamed[1]!), "Setup")
    assert.equal(
      parseSidebars(serializeSidebars({ sidebar: items }))?.sidebar.length,
      3,
    )
    assert.equal(parseSidebars("[1]"), null)
  })
})
