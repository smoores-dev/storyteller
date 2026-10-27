import React from "react"

import type { RateLimitSnapshot } from "../gitlab/rateLimit"
import type { SaveState } from "../storage/drafts"

export function SaveStatus({
  state,
  dirty,
  onOpen,
}: {
  state: SaveState
  dirty: boolean
  onOpen: () => void
}) {
  if (!dirty && state.status !== "error" && state.status !== "unavailable") {
    return null
  }

  const tone =
    state.status === "error"
      ? "text-danger"
      : state.status === "unavailable"
        ? "text-warn"
        : "text-muted"
  const text =
    state.status === "saving"
      ? "Saving…"
      : state.status === "error"
        ? "Not saved"
        : state.status === "unavailable"
          ? "Not stored"
          : "Saved in this browser"
  const title =
    state.status === "error"
      ? state.message
      : state.status === "unavailable"
        ? state.message
        : "Your changes are stored in this browser until you commit them. Click for backup options."
  return (
    <button
      type="button"
      className={`hover:bg-hover cursor-pointer rounded-md px-1.5 py-0.5 text-[12px] ${tone}`}
      title={title}
      onClick={onOpen}
    >
      <span
        aria-hidden="true"
        className={`mr-1 inline-block h-2 w-2 rounded-full ${state.status === "error" ? "bg-danger" : state.status === "unavailable" ? "bg-warn" : state.status === "saving" ? "bg-warn" : "bg-success"}`}
      />
      {text}
    </button>
  )
}

export function RateLimitChip({ snapshot }: { snapshot: RateLimitSnapshot }) {
  const share = snapshot.used / Math.max(snapshot.limit, 1)
  if (share < 0.1 && snapshot.blockedUntil === null) {
    return null
  }

  const tone =
    snapshot.blockedUntil !== null
      ? "text-danger border-danger/40"
      : share >= 0.8
        ? "text-warn border-warn/40"
        : "text-muted border-line"
  const left =
    snapshot.remainingHeader !== null
      ? snapshot.remainingHeader.toLocaleString()
      : Math.max(snapshot.limit - snapshot.used, 0).toLocaleString()
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[12px] ${tone}`}
      title={`This browser has made ${snapshot.used.toLocaleString()} GitLab requests in the last hour. GitLab allows ${snapshot.limit.toLocaleString()} an hour per signed in user.`}
    >
      {left} requests left
    </span>
  )
}
