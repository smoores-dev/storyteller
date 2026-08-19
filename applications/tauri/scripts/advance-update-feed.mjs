// channels are supersets: stable versions advance every feed,
// beta/rc versions advance latest-beta and latest-edge, all other
// prereleases (alpha, experimental, dev, test, preview) only latest-edge.
// TODO: maybe change this, have some way to communicate
// "this is a backport release, people on latest-beta should not get it"
//
// env: VERSION, PKG_URL, PLATFORM, SIG_FILE, ARTIFACT_URL, CI_JOB_TOKEN
// set DRY_RUN=1 to print the planned uploads instead of uploading

import fs from "node:fs"

const DRY_RUN = process.env.DRY_RUN === "1"

function required(name) {
  const value = process.env[name]
  if (!value) {
    console.error(`missing env var ${name}`)
    process.exit(1)
  }
  return value
}

const VERSION = required("VERSION")
const PKG_URL = required("PKG_URL")
const PLATFORM = required("PLATFORM")
const SIG_FILE = required("SIG_FILE")
const ARTIFACT_URL = required("ARTIFACT_URL")
const JOB_TOKEN = DRY_RUN ? process.env.CI_JOB_TOKEN : required("CI_JOB_TOKEN")

function parse(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(
    version,
  )
  if (!match) {
    console.error(`cannot parse version "${version}"`)
    process.exit(1)
  }
  return {
    release: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ? match[4].split(".") : [],
  }
}

// semver precedence (spec item 11), enough for our own version strings
function isGreater(aRaw, bRaw) {
  const a = parse(aRaw)
  const b = parse(bRaw)
  for (let i = 0; i < 3; i++) {
    if (a.release[i] !== b.release[i]) return a.release[i] > b.release[i]
  }
  if (a.prerelease.length === 0) return b.prerelease.length > 0
  if (b.prerelease.length === 0) return false
  const len = Math.max(a.prerelease.length, b.prerelease.length)
  for (let i = 0; i < len; i++) {
    const ai = a.prerelease[i]
    const bi = b.prerelease[i]
    if (ai === undefined) return false
    if (bi === undefined) return true
    if (ai === bi) continue
    const aNum = /^\d+$/.test(ai)
    const bNum = /^\d+$/.test(bi)
    if (aNum && bNum) return Number(ai) > Number(bi)
    if (aNum !== bNum) return bNum
    return ai > bi
  }
  return false
}

const kind = parse(VERSION).prerelease[0]?.replace(/\d+$/, "") ?? "stable"
const feeds =
  kind === "stable"
    ? ["latest", "latest-beta", "latest-edge"]
    : kind === "beta" || kind === "rc"
      ? ["latest-beta", "latest-edge"]
      : ["latest-edge"]

const signature = fs.readFileSync(SIG_FILE, "utf8").trim()

for (const feed of feeds) {
  const feedUrl = `${PKG_URL}/${feed}/latest.json`
  let current = null
  const res = await fetch(
    feedUrl,
    JOB_TOKEN ? { headers: { "JOB-TOKEN": JOB_TOKEN } } : {},
  )
  if (res.ok) {
    current = await res.json().catch(() => null)
  } else if (res.status !== 404) {
    console.error(`${feed}: reading current feed failed (${res.status})`)
    process.exit(1)
  }

  if (current?.version && !isGreater(VERSION, String(current.version))) {
    console.log(`${feed}: keeping ${current.version}, ${VERSION} is not newer`)
    continue
  }

  const next = {
    version: VERSION,
    pub_date: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    platforms: {
      ...(current?.platforms ?? {}),
      [PLATFORM]: { signature, url: ARTIFACT_URL },
    },
  }

  if (DRY_RUN) {
    console.log(`${feed}: would upload ${JSON.stringify(next, null, 2)}`)
    continue
  }
  const put = await fetch(feedUrl, {
    method: "PUT",
    headers: { "JOB-TOKEN": JOB_TOKEN },
    body: JSON.stringify(next, null, 2),
  })
  if (!put.ok) {
    console.error(`${feed}: upload failed (${put.status})`)
    process.exit(1)
  }
  console.log(`${feed}: advanced ${current?.version ?? "(empty)"} → ${VERSION}`)
}
