;(() => {
  const root = document.querySelector(".studio-root")
  if (!root) {
    throw new Error("Run this on the docs studio tab, the one with the editor.")
  }

  const key = Object.keys(root).find((name) => name.startsWith("__reactFiber$"))
  if (!key) {
    throw new Error("Could not find the editor state on this page.")
  }

  const found = []
  const seen = new Set()
  for (let fiber = root[key]; fiber; fiber = fiber.return) {
    let hook = fiber.memoizedState
    for (
      let steps = 0;
      hook && typeof hook === "object" && steps < 500;
      steps++
    ) {
      const value = hook.memoizedState
      if (
        value &&
        typeof value === "object" &&
        typeof value.changes === "object" &&
        value.changes !== null &&
        "projectId" in value &&
        "branch" in value &&
        !seen.has(value)
      ) {
        seen.add(value)
        found.push(value)
      }

      hook = hook.next
    }
  }

  found.sort(
    (a, b) => Object.keys(b.changes).length - Object.keys(a.changes).length,
  )
  const draft = found[0]
  if (!draft || Object.keys(draft.changes).length === 0) {
    throw new Error("The editor has no unsaved changes in memory.")
  }

  window.__studioDraft = draft
  const text = JSON.stringify(draft)
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  )
  const link = document.createElement("a")
  link.href = url
  link.download = `docs-studio-recovered-${Date.now()}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  return Object.keys(draft.changes)
})()
