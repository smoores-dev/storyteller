import FoliateManager from "/reader/FoliateManager.js"
import { makeBook } from "/fixtures/book.mjs"

const container = document.getElementById("reader-container")
const messages = []
const relocations = []
let view, renderer, manager, lastRange
let activityAt = performance.now()

window.webkit = {
  messageHandlers: new Proxy(
    {},
    {
      get: (_, name) => ({
        postMessage: (body) =>
          messages.push({ name, body, at: performance.now() }),
      }),
    },
  ),
}

function doc() {
  return renderer.getContents()[0].doc
}

// Independent oracle: measure text glyph rectangles and their clipping in
// outer-window coordinates. Do not use the production visibility helper or
// its page-index arithmetic. The fixture has zero horizontal paginator gap;
// the iframe supplies the vertical clipping inside the renderer's margins.
function geometry(range) {
  const owner = range.startContainer.ownerDocument
  if (owner !== doc()) throw new Error("Range belongs to an inactive document")
  const frame = owner.defaultView.frameElement.getBoundingClientRect()
  const bounds = renderer.getBoundingClientRect()
  const clip = {
    left: Math.max(frame.left, bounds.left),
    right: Math.min(frame.right, bounds.right),
    top: Math.max(frame.top, bounds.top),
    bottom: Math.min(frame.bottom, bounds.bottom),
  }
  let area = 0,
    visibleArea = 0
  const rects = Array.from(range.getClientRects(), (rect) => {
    const r = {
      left: frame.left + rect.left,
      right: frame.left + rect.right,
      top: frame.top + rect.top,
      bottom: frame.top + rect.bottom,
    }
    area += rect.width * rect.height
    visibleArea +=
      Math.max(0, Math.min(r.right, clip.right) - Math.max(r.left, clip.left)) *
      Math.max(0, Math.min(r.bottom, clip.bottom) - Math.max(r.top, clip.top))
    return r
  })
  return {
    area,
    visibleArea,
    ratio: area ? visibleArea / area : 0,
    rects,
    clip,
  }
}

function measure(id) {
  const element = doc().getElementById(id)
  if (!element) throw new Error(`Missing element ${id}`)
  const range = doc().createRange()
  range.selectNodeContents(element)
  return { id, ...geometry(range) }
}

function waitUntil(predicate, description) {
  const deadline = performance.now() + 8_000
  return new Promise((resolve, reject) => {
    function check() {
      try {
        if (predicate()) return resolve()
        if (performance.now() > deadline)
          return reject(new Error(`Timed out: ${description}`))
        requestAnimationFrame(check)
      } catch (error) {
        reject(error)
      }
    }
    check()
  })
}

async function settled() {
  await doc().fonts.ready
  let previous = "",
    stableSince = performance.now()
  // The current renderer has no public reflow lifecycle. Await the operation's
  // relocation separately, then require quiet events AND stable layout beyond
  // its 200ms snap/reflow and 250ms continuous-scroll settlement windows.
  await waitUntil(() => {
    const signature = JSON.stringify([
      renderer.start,
      renderer.size,
      renderer.viewSize,
      doc().body.getBoundingClientRect().height,
      relocations.length,
    ])
    if (signature !== previous) {
      previous = signature
      stableSince = performance.now()
    }
    return performance.now() - Math.max(stableSince, activityAt) >= 300
  }, "stable reader geometry and events")
}

async function afterRelocation(mark, reason) {
  await waitUntil(
    () => relocations.slice(mark).some((event) => event.reason === reason),
    `new ${reason} relocation after ${mark}`,
  )
  await settled()
}

async function navigate(href) {
  const mark = relocations.length
  manager.goTo(href)
  await afterRelocation(mark, "navigation")
}

window.reader = {
  async open({ book, href = book.sections[0]?.id, width = 412, height = 800 }) {
    if (manager)
      throw new Error("Reader already open; use a fresh page for another book")
    container.style.width = `${width}px`
    container.style.height = `${height}px`
    manager = new FoliateManager()
    await manager.open(makeBook(book))
    view = document.querySelector("foliate-view")
    renderer = view.renderer
    renderer.setAttribute("gap", "0%")
    renderer.setAttribute("margin", "30px")
    renderer.setAttribute("max-column-count", "1")
    // Deliver the container's initial ResizeObserver notification before
    // loading a section. Otherwise it can render an iframe with no document.
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    )
    renderer.addEventListener("scroll", () => {
      activityAt = performance.now()
    })
    renderer.addEventListener("relocate", ({ detail }) => {
      activityAt = performance.now()
      lastRange = detail.range.cloneRange()
      relocations.push({
        reason: detail.reason,
        sectionIndex: renderer.getContents()[0].index,
        page: renderer.page,
        at: activityAt,
      })
    })
    // Initial font/layout work can finish with an anchor relocation. Let the
    // section finish loading before exercising explicit restored navigation.
    await view.goTo(href)
    await waitUntil(() => relocations.length > 0, "initial section relocation")
    await settled()
  },
  navigate,
  async goTo(href, { smooth = false } = {}) {
    renderer.toggleAttribute("animated", smooth)
    await view.goTo(href, { smooth })
  },
  document: doc,
  fullyVisibleElementIds: () => manager.getFullyVisibleElementIds(),
  setReflowAnchor(sectionIndex, id) {
    manager.setReflowAnchor(sectionIndex, id)
  },
  geometry,
  afterRelocation,
  measure,
  settled,
  clearHighlight() {
    manager.clearHighlight()
  },
  async highlight(id, seek = true) {
    const mark = messages.length
    manager.highlightFragment(renderer.getContents()[0].index, id, seek)
    await waitUntil(
      () =>
        messages
          .slice(mark)
          .some((m) => m.name === "ElementVisibility" && m.body.textId === id),
      "highlight visibility message",
    )
    await settled()
  },
  async reflow({ css, height, width }) {
    const mark = relocations.length
    if (height !== undefined) container.style.height = `${height}px`
    if (width !== undefined) container.style.width = `${width}px`
    // CSS replaces the previous test stylesheet; calls do not accumulate rules.
    if (css !== undefined) renderer.setStyles(css)
    renderer.render()
    await afterRelocation(mark, "anchor")
  },
  async turnPage(direction = "next") {
    const result = await view[direction](undefined, false)
    await settled()
    return result
  },
  visibleTextRange() {
    // Preserve the first actual character rather than a potentially empty
    // collapsed boundary. The independent oracle measures this after reflow.
    const walker = doc().createTreeWalker(
      lastRange.commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
    )
    let node = walker.currentNode
    do {
      if (node.nodeType !== Node.TEXT_NODE) continue
      for (let offset = 0; offset < node.length; offset++) {
        if (!node.textContent[offset].trim()) continue
        const range = doc().createRange()
        range.setStart(node, offset)
        range.setEnd(node, offset + 1)
        if (geometry(range).ratio > 0.99) {
          return range
        }
      }
    } while ((node = walker.nextNode()))
    throw new Error("No visible character to preserve")
  },
  snapshot() {
    return {
      sectionIndex: renderer?.getContents()[0]?.index ?? null,
      messages: structuredClone(messages),
      relocations: structuredClone(relocations),
      page: renderer?.page ?? null,
      start: renderer?.start ?? null,
      size: renderer?.size ?? null,
    }
  },
}
