import assert from "node:assert/strict"

import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, it } from "vitest"

import type { StudioConfig } from "../config"
import type {
  GitLabDiscussion,
  GitLabMergeRequestDetail,
} from "../gitlab/client"
import type { SidebarOutline } from "../model/outline"
import { FileTree } from "../ui/FileTree"
import { MergeRequestPanel, openDiscussionCount } from "../ui/MergeRequestPanel"
import { ConflictDialog, MoveDialog } from "../ui/dialogs"
import type { AsyncState, TreeFile } from "../ui/hooks"

const config: StudioConfig = {
  gitlab: { baseUrl: "https://gitlab.com", projectPath: "a/b", appId: null },
  defaultBranch: "main",
  docsRoot: "applications/docs",
  contentRoots: ["docs", "versioned_docs", "contributing"],
  staticRoot: "static",
  editPath: "/edit",
}

const files: TreeFile[] = [
  {
    file: "docs/welcome.md",
    repoPath: "applications/docs/docs/welcome.md",
    blobId: "b",
    kind: "markdown",
  },
  {
    file: "docs/guide/setup.mdx",
    repoPath: "applications/docs/docs/guide/setup.mdx",
    blobId: "b",
    kind: "markdown",
  },
  {
    file: "docs/guide/shot.png",
    repoPath: "applications/docs/docs/guide/shot.png",
    blobId: "b",
    kind: "image",
  },
  {
    file: "docs/orphan.md",
    repoPath: "applications/docs/docs/orphan.md",
    blobId: "b",
    kind: "markdown",
  },
  {
    file: "blog/post.md",
    repoPath: "applications/docs/blog/post.md",
    blobId: "b",
    kind: "markdown",
  },
]

const outline: SidebarOutline = {
  versions: [
    {
      pluginId: "default",
      version: "current",
      label: "3.0",
      title: "Docs 3.0",
      contentPath: "docs",
      sidebarFile: "sidebars.json",
      manual: true,
      className: "docs-version-current",
      isLast: false,
      sidebars: {
        sidebar: [
          {
            type: "doc",
            id: "welcome",
            file: "docs/welcome.md",
            label: "Welcome",
          },
          {
            type: "category",
            label: "Guide",
            file: null,
            items: [
              {
                type: "doc",
                id: "guide/setup",
                file: "docs/guide/setup.mdx",
                label: "Setup",
              },
              {
                type: "doc",
                id: "guide/missing",
                file: "docs/guide/missing.md",
                label: "Gone",
              },
              { type: "link", label: "GitLab", href: "https://gitlab.com" },
            ],
          },
        ],
      },
      docs: [
        {
          id: "welcome",
          file: "docs/welcome.md",
          editFile: null,
          title: "Welcome to Storyteller",
          sidebar: "sidebar",
          unlisted: false,
        },
      ],
    },
  ],
}

function ready<T>(data: T): AsyncState<T> {
  return { status: "ready", data, error: null, reload: () => undefined }
}

describe("FileTree", () => {
  it("renders the sidebar view with categories, extras and other pages", () => {
    const html = renderToStaticMarkup(
      React.createElement(FileTree, {
        files,
        selected: "docs/welcome.md",
        changed: new Set(["docs/welcome.md"]),
        deleted: new Set<string>(),
        newFiles: ["docs/guide/new-page.md"],
        outline,
        models: [],
        view: "sidebar",
        onViewChange: () => undefined,
        onSelect: () => undefined,
        onMove: () => undefined,
        onDrop: () => undefined,
        showImages: true,
      }),
    )
    assert.match(html, /Docs 3\.0/)
    assert.match(html, /Guide/)
    assert.match(html, /Setup/)
    assert.match(html, /Not in the sidebar/)
    assert.match(html, /orphan\.md/)
    assert.match(html, /guide\/new-page\.md/)
    assert.match(html, /Other pages/)
    assert.match(html, /blog\/post\.md/)
    assert.match(html, /Move or rename welcome\.md/)
    assert.match(html, /aria-current="true"/)
  })
  it("renders an editable sidebar from the branch's sidebars file", () => {
    const html = renderToStaticMarkup(
      React.createElement(FileTree, {
        files,
        selected: null,
        changed: new Set<string>(),
        deleted: new Set<string>(),
        newFiles: [],
        outline,
        models: [
          {
            key: "default:current",
            version: outline.versions[0]!,
            repoPath: "applications/docs/sidebars.json",
            base: { content: "{}", lastCommitId: "abc" },
            sidebars: {
              sidebar: [
                "welcome",
                {
                  type: "category",
                  label: "Guide",
                  items: [
                    "guide/setup",
                    { type: "link", label: "Ext", href: "https://x" },
                  ],
                },
              ],
            },
            local: true,
          },
        ],
        view: "sidebar",
        onViewChange: () => undefined,
        onSelect: () => undefined,
        onSidebarEdit: () => undefined,
        showImages: false,
      }),
    )
    assert.match(html, /Welcome to Storyteller/)
    assert.match(html, /Guide/)
    assert.match(html, /Ext/)
    assert.match(html, /Remove from the sidebar/)
    assert.match(html, /New category/)
    assert.match(html, /Rename category/)
    assert.match(html, /Not in the sidebar/)
    assert.match(html, /orphan\.md/)
    assert.match(html, /Sidebar changed/)
    assert.match(html, /draggable="true"/)
  })
  it("renders the files view with icons and drag handles", () => {
    const html = renderToStaticMarkup(
      React.createElement(FileTree, {
        files,
        selected: null,
        changed: new Set<string>(),
        deleted: new Set(["docs/orphan.md"]),
        newFiles: [],
        outline,
        models: [],
        view: "files",
        onViewChange: () => undefined,
        onSelect: () => undefined,
        onNewFile: () => undefined,
        onDrop: () => undefined,
        showImages: true,
      }),
    )
    assert.match(html, /draggable="true"/)
    assert.match(html, /shot\.png/)
    assert.match(html, /line-through/)
    assert.match(html, /New page in docs\/guide/)
    assert.match(html, /<svg/)
  })
})

describe("dialogs", () => {
  it("renders the move dialog with the target path", () => {
    const html = renderToStaticMarkup(
      React.createElement(MoveDialog, {
        file: "docs/guide/setup.mdx",
        directories: ["docs", "docs/guide"],
        config,
        existingPaths: new Set<string>(),
        onConfirm: () => undefined,
        onClose: () => undefined,
      }),
    )
    assert.match(html, /Move or rename/)
    assert.match(html, /docs\/guide\/setup\.mdx/)
    assert.match(html, /Relative links inside the moved page are rewritten/)
  })
  it("renders the conflict dialog with a diff", () => {
    const html = renderToStaticMarkup(
      React.createElement(ConflictDialog, {
        files: [
          {
            repoPath: "applications/docs/docs/welcome.md",
            mine: "a\nmine\n",
            theirs: "a\ntheirs\n",
            theirsCommit: "def",
            textual: true,
          },
        ],
        branch: "docs/x",
        config,
        onResolve: () => Promise.resolve(),
        onClose: () => undefined,
      }),
    )
    assert.match(html, /Someone else changed these files/)
    assert.match(html, /Keep mine/)
    assert.match(html, /Take theirs/)
    assert.match(html, /theirs/)
    assert.match(html, /studio-diff/)
  })
})

describe("MergeRequestPanel", () => {
  const mr: GitLabMergeRequestDetail = {
    iid: 12,
    title: "docs: thing",
    state: "opened",
    web_url: "https://gitlab.com/a/b/-/merge_requests/12",
    draft: true,
    source_branch: "docs/x",
    target_branch: "main",
    source_project_id: 1,
    target_project_id: 1,
    head_pipeline: { id: 1, status: "success", web_url: "https://p" },
    changes_count: "3",
    diff_refs: { base_sha: "b", head_sha: "h", start_sha: "s" },
  }
  const author = {
    id: 1,
    username: "rev",
    name: "Reviewer",
    avatar_url: null,
    web_url: "",
  }
  const discussions: GitLabDiscussion[] = [
    {
      id: "d1",
      individual_note: false,
      notes: [
        {
          id: 1,
          body: "Typo here",
          author,
          created_at: "2026-08-22T10:00:00Z",
          system: false,
          resolvable: true,
          resolved: false,
          position: {
            position_type: "text",
            new_path: "applications/docs/docs/welcome.md",
            old_path: "applications/docs/docs/welcome.md",
            new_line: 4,
            old_line: null,
          },
        },
      ],
    },
    {
      id: "d2",
      individual_note: false,
      notes: [
        {
          id: 2,
          body: "Resolved one",
          author,
          created_at: "2026-08-22T10:00:00Z",
          system: false,
          resolvable: true,
          resolved: true,
        },
      ],
    },
  ]
  const project = {
    id: 1,
    path_with_namespace: "a/b",
    name: "b",
    default_branch: "main",
    web_url: "https://gitlab.com/a/b",
    visibility: "public" as const,
    namespace: { id: 1, path: "a", kind: "user" },
  }
  const render = (tab: "overview" | "comments") =>
    renderToStaticMarkup(
      React.createElement(MergeRequestPanel, {
        client: {} as never,
        upstream: project,
        source: project,
        branch: "docs/x",
        defaultBranch: "main",
        shareUrl: "https://docs/edit?branch=docs/x",
        signedIn: true,
        canWrite: true,
        branchExists: true,
        mergeRequest: ready<GitLabMergeRequestDetail | null>(mr),
        discussions: ready(discussions),
        config,
        renderPreview: () => null,
        loadSourceFile: () => Promise.resolve(null),
        currentFile: "docs/welcome.md",
        currentLine: () => 7,
        onOpenFile: () => undefined,
        tab,
        onTabChange: () => undefined,
        draft: null,
        onVersionFile: () => undefined,
      }),
    )
  it("counts only open discussions", () => {
    assert.equal(openDiscussionCount(discussions), 1)
  })
  it("renders the overview with pipeline and change count", () => {
    const html = render("overview")
    assert.match(html, /Pipeline passed/)
    assert.match(html, /3 changed files/)
    assert.match(html, /Comments \(1\)/)
  })
  it("renders comments with file anchors and the line comment button", () => {
    const html = render("comments")
    assert.match(html, /Typo here/)
    assert.match(html, /docs\/welcome\.md:4/)
    assert.match(html, /Comment on line 7 of welcome\.md/)
    assert.doesNotMatch(html, /Resolved one/)
  })
})
