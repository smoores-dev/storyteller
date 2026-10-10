import assert from "node:assert"

import { describe, it } from "vitest"

import {
  type MatchCandidate,
  type MatchSubject,
  nameSimilarity,
  rankMatches,
  scoreMatch,
  titleSimilarity,
} from "@/metadata/match"

function subject(overrides: Partial<MatchSubject> = {}): MatchSubject {
  return {
    title: "Dune",
    authors: ["Frank Herbert"],
    narrators: [],
    seriesNames: [],
    isbns: [],
    asins: [],
    hasAudiobook: false,
    hasEbook: true,
    ...overrides,
  }
}

function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    provider: "hardcover",
    id: "1",
    title: "Dune",
    authors: ["Frank Herbert"],
    narrators: [],
    seriesNames: [],
    isbns: [],
    asins: [],
    ...overrides,
  }
}

describe("string similarity", () => {
  it("treats a subtitle-extended title as close but not identical", () => {
    const exact = titleSimilarity("Dune", "Dune")
    const extended = titleSimilarity("Dune", "Dune: The Graphic Novel")
    assert.strictEqual(exact, 1)
    assert.ok(extended < exact, "extended title must score lower than exact")
    assert.ok(extended > 0.4, "extended title is still a plausible match")
  })

  it("separates a book from its series sibling", () => {
    const right = titleSimilarity("Dune", "Dune")
    const wrong = titleSimilarity("Dune", "Dune Messiah")
    assert.ok(wrong < right - 0.1, `sibling ${wrong} too close to ${right}`)
  })

  it("ignores edition noise", () => {
    assert.ok(
      titleSimilarity("Dune", "Dune (Unabridged)") > 0.95,
      "bracketed edition noise must not cost anything",
    )
  })

  it("matches an author across initials and full first names", () => {
    assert.ok(nameSimilarity("Ursula K. Le Guin", "Ursula Le Guin") > 0.9)
    assert.ok(
      nameSimilarity("J. R. R. Tolkien", "John Ronald Reuel Tolkien") > 0.6,
    )
    assert.ok(nameSimilarity("Frank Herbert", "Brian Herbert") < 0.9)
  })
})

describe("scoreMatch", () => {
  it("calls an identifier hit certain", () => {
    const result = scoreMatch(
      subject({ isbns: ["978-0-441-01359-3"] }),
      candidate({ isbns: ["9780441013593"] }),
    )
    assert.strictEqual(result.confidence, "certain")
    assert.ok(result.score > 0.9)
  })

  it("does not call an identifier hit certain when the title disagrees", () => {
    const result = scoreMatch(
      subject({ isbns: ["9780441013593"] }),
      candidate({ isbns: ["9780441013593"], title: "A Wizard of Earthsea" }),
    )
    assert.notStrictEqual(result.confidence, "certain")
  })

  it("drops a candidate whose author does not overlap", () => {
    const same = scoreMatch(subject(), candidate())
    const other = scoreMatch(
      subject(),
      candidate({ authors: ["Kevin J. Anderson"] }),
    )
    assert.ok(other.score < same.score - 0.15)
  })

  it("rewards a matching audiobook duration", () => {
    const withDuration = scoreMatch(
      subject({ durationSeconds: 12 * 3600, hasAudiobook: true }),
      candidate({ durationSeconds: 12 * 3600 + 240, format: "audiobook" }),
    )
    const wrongDuration = scoreMatch(
      subject({ durationSeconds: 12 * 3600, hasAudiobook: true }),
      candidate({ durationSeconds: 4 * 3600, format: "audiobook" }),
    )
    assert.ok(withDuration.score > wrongDuration.score + 0.2)
  })

  it("skips signals neither side can supply", () => {
    const result = scoreMatch(subject(), candidate())
    const names = result.signals.map((signal) => signal.name)
    assert.ok(!names.includes("narrators"))
    assert.ok(!names.includes("extent"))
    assert.ok(!names.includes("identifier"))
  })
})

describe("rankMatches", () => {
  it("refuses to call an ambiguous best match high confidence", () => {
    const ranked = rankMatches(subject(), [
      candidate({ id: "1", title: "Dune" }),
      candidate({ id: "2", title: "Dune" }),
    ])

    assert.strictEqual(ranked[0]?.margin, 0)
    assert.strictEqual(
      ranked[0].confidence,
      "medium",
      "two identical candidates must never auto-apply",
    )
  })

  it("is confident when one candidate clearly leads", () => {
    const ranked = rankMatches(subject({ publicationYear: 1965 }), [
      candidate({ id: "1", title: "Dune", publicationYear: 1965 }),
      candidate({
        id: "2",
        title: "The Road to Dune",
        authors: ["Brian Herbert"],
        publicationYear: 2005,
      }),
    ])

    assert.strictEqual(ranked[0]?.candidate.id, "1")
    assert.ok(ranked[0].margin > 0.06)
    assert.strictEqual(ranked[0].confidence, "high")
  })

  it("prefers the edition whose narrator matches", () => {
    const [best] = rankMatches(
      subject({
        narrators: ["Scott Brick"],
        hasAudiobook: true,
        durationSeconds: 21 * 3600,
      }),
      [
        candidate({
          id: "a",
          narrators: ["Simon Vance"],
          durationSeconds: 15 * 3600,
          format: "audiobook",
        }),
        candidate({
          id: "b",
          narrators: ["Scott Brick"],
          durationSeconds: 21 * 3600,
          format: "audiobook",
        }),
      ],
    )

    assert.strictEqual(best?.candidate.id, "b")
  })

  it("returns nothing for an empty candidate list", () => {
    assert.deepStrictEqual(rankMatches(subject(), []), [])
  })
})
