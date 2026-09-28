import assert from "node:assert/strict"

import { describe, it } from "vitest"

import {
  headingSlugs,
  rewriteApiLinks,
  rewriteOverviewLinks,
  split,
} from "../../../../utils/libraryDocs"

describe("library docs generation", () => {
  const stub =
    "# @x/lib\n\nIntro [API](#api-docs) and [Epub](#epub).\n\n## Usage\n\nSee [usage](#usage) and [license](docs/LICENSE.md) and ![shot](./img/a.png).\n"
  const readme = `${stub.trimEnd()}\n\n## API Docs\n\n## Epub\n\nDefined in [x](../#epub#constructor) and [y](../#other).\n`
  const sourceUrl = (relative: string, image: boolean) =>
    `https://git/${image ? "raw" : "blob"}/lib/${relative.replace(/^\.\//, "")}`
  it("splits the stub from the generated part", () => {
    const { overview, api } = split(readme, stub)
    assert.equal(overview, stub)
    assert.match(api, /^\n\n## API Docs/)
    const noStub = split(readme, null)
    assert.match(noStub.overview, /Intro/)
    assert.match(noStub.api, /^## API Docs/)
    assert.equal(split("# only prose\n", null).api, "")
  })
  it("rewrites anchors to the api page and relative files to the repo", () => {
    const apiSlugs = headingSlugs(split(readme, stub).api)
    assert.deepEqual(apiSlugs, ["api-docs", "epub"])
    const out = rewriteOverviewLinks(
      stub,
      apiSlugs,
      "/libraries/lib/api",
      sourceUrl,
    )
    assert.match(out, /\[API\]\(\/libraries\/lib\/api\)/)
    assert.match(out, /\[Epub\]\(\/libraries\/lib\/api#epub\)/)
    assert.match(out, /\[usage\]\(#usage\)/)
    assert.match(
      out,
      /\[license\]\(https:\/\/git\/blob\/lib\/docs\/LICENSE\.md\)/,
    )
    assert.match(out, /!\[shot\]\(https:\/\/git\/raw\/lib\/img\/a\.png\)/)
  })
  it("normalizes typedoc sibling links in the api part", () => {
    const out = rewriteApiLinks(split(readme, stub).api, sourceUrl)
    assert.match(out, /\[x\]\(#constructor\)/)
    assert.match(out, /\[y\]\(#other\)/)
  })
})
