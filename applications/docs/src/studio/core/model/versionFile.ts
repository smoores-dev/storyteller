export const VERSIONS_DIR = ".yarn/versions"

export type Bump = "patch" | "minor" | "major" | "none"

export const BUMPS: { value: Bump; label: string }[] = [
  { value: "patch", label: "Patch" },
  { value: "minor", label: "Minor" },
  { value: "major", label: "Major" },
  { value: "none", label: "No release" },
]

export interface VersionDecisions {
  releases: Map<string, string>
  declined: string[]
}

function unquote(value: string): string {
  const trimmed = value.trim()
  const match = /^(["'])(.*)\1$/.exec(trimmed)
  return match ? match[2]! : trimmed
}

export function parseVersionFile(text: string): VersionDecisions {
  const releases = new Map<string, string>()
  const declined: string[] = []
  let section: "releases" | "declined" | null = null
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) {
      continue
    }

    if (/^releases:\s*$/.test(line)) {
      section = "releases"
      continue
    }

    if (/^declined:\s*$/.test(line)) {
      section = "declined"
      continue
    }

    if (!/^\s/.test(line)) {
      section = null
      continue
    }

    if (section === "releases") {
      const match = /^\s+(.+?):\s*(\S+)\s*$/.exec(line)
      if (match) {
        releases.set(unquote(match[1]!), match[2]!)
      }
    } else if (section === "declined") {
      const match = /^\s+-\s+(.+?)\s*$/.exec(line)
      if (match) {
        declined.push(unquote(match[1]!))
      }
    }
  }

  return { releases, declined }
}

export function serializeVersionFile(decisions: VersionDecisions): string {
  const parts: string[] = []
  if (decisions.releases.size > 0) {
    parts.push(
      [
        "releases:",
        ...[...decisions.releases].map(
          ([name, bump]) => `  "${name}": ${bump}`,
        ),
      ].join("\n"),
    )
  }

  if (decisions.declined.length > 0) {
    parts.push(
      ["declined:", ...decisions.declined.map((name) => `  - "${name}"`)].join(
        "\n",
      ),
    )
  }

  return `${parts.join("\n\n")}\n`
}

export function decisionFor(
  decisions: VersionDecisions,
  name: string,
): Bump | null {
  const release = decisions.releases.get(name)
  if (release === "patch" || release === "minor" || release === "major") {
    return release
  }

  if (decisions.declined.includes(name)) {
    return "none"
  }

  return null
}

export function withDecision(
  decisions: VersionDecisions,
  name: string,
  bump: Bump,
): VersionDecisions {
  const releases = new Map(decisions.releases)
  const declined = decisions.declined.filter((entry) => entry !== name)
  if (bump === "none") {
    releases.delete(name)
    declined.push(name)
  } else {
    releases.set(name, bump)
  }

  return { releases, declined }
}

export async function versionFileName(branch: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(branch),
  )
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
  return `${VERSIONS_DIR}/${hex.slice(0, 8)}.yml`
}

export function isVersionFile(path: string): boolean {
  return path.startsWith(`${VERSIONS_DIR}/`) && path.endsWith(".yml")
}

export function touchedLibraries(paths: Iterable<string>): string[] {
  const dirs = new Set<string>()
  for (const path of paths) {
    const match = /^libraries\/([^/]+)\//.exec(path)
    if (match) {
      dirs.add(match[1]!)
    }
  }

  return [...dirs].sort()
}
