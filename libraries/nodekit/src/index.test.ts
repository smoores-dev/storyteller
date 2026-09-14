import assert from "node:assert/strict"
import { resolve } from "node:path"

import { describe, it } from "vitest"

import { asCoverProvider, asMetadataProvider } from "./index.ts"
import {
  NodeKitLoadError,
  type NodeKitRaw,
  StorytellerNodeKit,
  describeAddonResolution,
  loadAddon,
  resolveAddonPath,
} from "./nodekit.ts"

const repoRoot = resolve(import.meta.dirname, "../../..")

const ADDON_CACHE = Symbol.for("storyteller-platform.nodekit.addon")
const FAKE_PATH = "/tmp/nodekit-test-fake.node"

type CacheHost = typeof globalThis & {
  [ADDON_CACHE]?: { path: string; addon: NodeKitRaw }
}

function fakeAddon(failConfigure = false) {
  const log: string[] = []

  const addon: NodeKitRaw = {
    configure: (options) => {
      log.push(`configure:${options}`)
      return failConfigure
        ? Promise.reject(new Error("bad config"))
        : Promise.resolve()
    },
    metadataSearch: (options) => {
      log.push(`metadataSearch:${options}`)
      return Promise.resolve(JSON.stringify([{ id: 7 }]))
    },
    metadataBook: () => Promise.resolve("{}"),
    metadataBookRaw: () => Promise.resolve("{}"),
    coverSearch: () => Promise.resolve("[]"),
    download: () => Promise.reject(new Error("unused")),
  }

  return { addon, log }
}

async function withFakeAddon(
  addon: NodeKitRaw,
  run: () => Promise<void>,
): Promise<void> {
  const host = globalThis as CacheHost
  const savedCache = host[ADDON_CACHE]
  const savedPath = process.env["STORYTELLER_NODEKIT_PATH"]

  host[ADDON_CACHE] = { path: FAKE_PATH, addon }
  process.env["STORYTELLER_NODEKIT_PATH"] = FAKE_PATH

  try {
    await run()
  } finally {
    if (savedCache === undefined) Reflect.deleteProperty(host, ADDON_CACHE)
    else host[ADDON_CACHE] = savedCache
    if (savedPath === undefined) {
      Reflect.deleteProperty(process.env, "STORYTELLER_NODEKIT_PATH")
    } else {
      process.env["STORYTELLER_NODEKIT_PATH"] = savedPath
    }
  }
}

describe("asMetadataProvider", () => {
  it("passes through known providers", () => {
    assert.equal(asMetadataProvider("hardcover"), "hardcover")
    assert.equal(asMetadataProvider("audnexus"), "audnexus")
  })

  it("rejects anything else", () => {
    assert.equal(asMetadataProvider("apple"), undefined)
    assert.equal(asMetadataProvider(""), undefined)
    assert.equal(asMetadataProvider(null), undefined)
    assert.equal(asMetadataProvider(undefined), undefined)
  })
})

describe("asCoverProvider", () => {
  it("passes through known providers", () => {
    assert.equal(asCoverProvider("apple"), "apple")
    assert.equal(asCoverProvider("hardcover"), "hardcover")
  })

  it("rejects anything else", () => {
    assert.equal(asCoverProvider("audnexus"), undefined)
    assert.equal(asCoverProvider(null), undefined)
  })
})

const ENV_KEYS = [
  "STORYTELLER_NODEKIT_PATH",
  "STORYTELLER_NODEKIT_SOURCE",
] as const

function withEnv(
  overrides: Partial<Record<(typeof ENV_KEYS)[number], string>>,
  run: () => void,
) {
  const saved = ENV_KEYS.map((key) => [key, process.env[key]] as const)

  for (const key of ENV_KEYS) Reflect.deleteProperty(process.env, key)
  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value
  }

  try {
    run()
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
    }
  }
}

describe("resolveAddonPath", () => {
  it("prefers the env override", () => {
    withEnv({ STORYTELLER_NODEKIT_PATH: "/tmp/does-not-exist.node" }, () => {
      assert.equal(resolveAddonPath(), "/tmp/does-not-exist.node")
    })
  })

  it("throws NodeKitLoadError when the addon cannot be opened", () => {
    withEnv({ STORYTELLER_NODEKIT_PATH: "/tmp/does-not-exist.node" }, () => {
      assert.throws(loadAddon, NodeKitLoadError)
    })
  })
})

describe("loadAddon", () => {
  it("dlopens the addon at most once", (t) => {
    if (!resolveAddonPath()) {
      t.skip("no addon built for this platform")
      return
    }

    assert.equal(loadAddon(), loadAddon())
  })
})

describe("StorytellerNodeKit constructor options", () => {
  it("configures once, before the first call", async () => {
    const { addon, log } = fakeAddon()

    await withFakeAddon(addon, async () => {
      const kit = new StorytellerNodeKit({ tokens: { hardcover: "t" } })
      await kit.metadataSearch({ query: "a" })
      await kit.metadataSearch({ query: "b" })

      assert.deepEqual(log, [
        `configure:${JSON.stringify({ tokens: { hardcover: "t" } })}`,
        `metadataSearch:${JSON.stringify({ query: "a" })}`,
        `metadataSearch:${JSON.stringify({ query: "b" })}`,
      ])
    })
  })

  it("does not configure when constructed without options", async () => {
    const { addon, log } = fakeAddon()

    await withFakeAddon(addon, async () => {
      await new StorytellerNodeKit().metadataSearch({ query: "a" })

      assert.deepEqual(log, [
        `metadataSearch:${JSON.stringify({ query: "a" })}`,
      ])
    })
  })

  it("surfaces a failed constructor configure on the first call", async () => {
    const { addon } = fakeAddon(true)

    await withFakeAddon(addon, async () => {
      const kit = new StorytellerNodeKit({ tokens: {} })

      await assert.rejects(
        () => kit.metadataSearch({ query: "a" }),
        /bad config/,
      )
    })
  })

  it("recovers after a later successful configure", async () => {
    const { addon } = fakeAddon(true)

    await withFakeAddon(addon, async () => {
      const kit = new StorytellerNodeKit({ tokens: {} })
      await assert.rejects(() => kit.metadataSearch({ query: "a" }))

      addon.configure = () => Promise.resolve()
      await kit.configure({ tokens: {} })

      assert.equal((await kit.metadataSearch({ query: "a" })).length, 1)
    })
  })
})

describe("describeAddonResolution", () => {
  it("checks local before npm by default", () => {
    withEnv({}, () => {
      const { sources, candidates } = describeAddonResolution()

      assert.deepEqual(sources, ["local", "npm"])
      assert.equal(candidates.at(0)?.source, "local")
      assert.equal(candidates.at(-1)?.source, "npm")
    })
  })

  it("looks for a build next to the package", () => {
    withEnv({ STORYTELLER_NODEKIT_SOURCE: "local" }, () => {
      const { candidates, platform } = describeAddonResolution()
      const packageRelative = resolve(
        import.meta.dirname,
        "..",
        `nodekit.${platform.replace("linux-x64", "linux-x64-gnu")}.node`,
      )

      assert.ok(
        candidates.some((candidate) => candidate.path === packageRelative),
        `expected ${packageRelative} among ${candidates.length} candidates`,
      )
    })
  })

  it("restricts candidates to the requested source", () => {
    withEnv({ STORYTELLER_NODEKIT_SOURCE: "npm" }, () => {
      const { sources, candidates } = describeAddonResolution()

      assert.deepEqual(sources, ["npm"])
      assert.ok(candidates.every((candidate) => candidate.source === "npm"))
    })

    withEnv({ STORYTELLER_NODEKIT_SOURCE: "local" }, () => {
      const { candidates } = describeAddonResolution()

      assert.ok(candidates.every((candidate) => candidate.source === "local"))
    })
  })

  it("stops walking up at the repository root", () => {
    withEnv({ STORYTELLER_NODEKIT_SOURCE: "local" }, () => {
      const { candidates } = describeAddonResolution()

      assert.ok(
        candidates.every((candidate) => candidate.path.startsWith(repoRoot)),
        "candidates should stay inside the repository",
      )
    })
  })

  it("rejects an unknown source", () => {
    withEnv({ STORYTELLER_NODEKIT_SOURCE: "nope" }, () => {
      assert.throws(describeAddonResolution, NodeKitLoadError)
    })
  })
})
