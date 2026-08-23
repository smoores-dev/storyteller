const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

class PageTurnSelectionGuard {
  static #attribute = "data-foliate-suppress-selection"
  static #styles = `
:root[data-foliate-suppress-selection],
:root[data-foliate-suppress-selection] * {
  -webkit-user-select: none !important;
  user-select: none !important;
}`

  #active = false
  #document = null
  #pointerDocument = null
  #touchActive = false
  #isSettled

  constructor(isSettled) {
    this.#isSettled = isSettled
  }
  attach(document) {
    this.#document = document
    // Pointer selection belongs to the replaced document. Touch state belongs
    // to the paginator and may remain active across a chapter replacement.
    this.#pointerDocument = null

    const style = document.createElement("style")
    style.textContent = PageTurnSelectionGuard.#styles
    document.head?.append(style)
    this.#syncDocument()

    document.addEventListener(
      "selectstart",
      (event) => {
        if (this.#active && document === this.#document) event.preventDefault()
      },
      true,
    )
    document.addEventListener(
      "selectionchange",
      () => {
        if (this.#active && document === this.#document) this.#clearSelection()
      },
      true,
    )
    document.addEventListener(
      "pointerdown",
      () => {
        if (document === this.#document) this.#pointerDocument = document
      },
      true,
    )
    const endPointer = () => {
      if (this.#pointerDocument !== document) return
      this.#pointerDocument = null
      this.releaseIfSettled()
    }
    document.addEventListener("pointerup", endPointer, true)
    document.addEventListener("pointercancel", endPointer, true)
  }
  hasActivePointer(document) {
    return this.#pointerDocument === document
  }
  get touchActive() {
    return this.#touchActive
  }
  startTouch() {
    this.#touchActive = true
  }
  endTouch(event) {
    this.#touchActive = Boolean(event.touches?.length)
    this.releaseIfSettled()
  }
  suppress() {
    this.#active = true
    this.#syncDocument()
    this.#clearSelection()
  }
  releaseIfSettled() {
    if (
      !this.#active ||
      !this.#isSettled() ||
      this.#pointerDocument ||
      this.#touchActive
    )
      return
    this.#active = false
    this.#syncDocument()
  }
  #syncDocument() {
    this.#document?.documentElement.toggleAttribute(
      PageTurnSelectionGuard.#attribute,
      this.#active,
    )
  }
  #clearSelection() {
    const selection = this.#document?.getSelection()
    if (selection?.rangeCount) selection.removeAllRanges()
  }
}

class CommittedPageTurnInputGuard {
  static #attribute = "data-committed-page-turn"

  #host
  #onBlockedInteraction
  #requested = false
  #pointers = new Set()
  #touches = 0
  #wheel = false
  #releaseWheelAfterIdle

  constructor({ host, blocker, onBlockedInteraction }) {
    this.#host = host
    this.#onBlockedInteraction = onBlockedInteraction
    this.#releaseWheelAfterIdle = debounce(() => {
      this.#wheel = false
      this.#notifyBlockedInteraction()
      this.#sync()
    }, 150)

    blocker.addEventListener("pointerdown", (event) => {
      this.#pointers.add(event.pointerId)
      try {
        blocker.setPointerCapture?.(event.pointerId)
      } catch {}
      this.#consume(event)
      this.#notifyBlockedInteraction()
    })
    const endPointer = (event) => {
      this.#pointers.delete(event.pointerId)
      this.#consume(event)
      this.#notifyBlockedInteraction()
      this.#sync()
    }
    blocker.addEventListener("pointerup", endPointer)
    blocker.addEventListener("pointercancel", endPointer)
    blocker.addEventListener("lostpointercapture", (event) => {
      this.#pointers.delete(event.pointerId)
      this.#notifyBlockedInteraction()
      this.#sync()
    })
    blocker.addEventListener("pointermove", (event) => {
      this.#consume(event)
      this.#notifyBlockedInteraction()
    })
    for (const type of [
      "click",
      "dblclick",
      "contextmenu",
      "dragstart",
      "selectstart",
    ])
      blocker.addEventListener(type, (event) => this.#consume(event))
    for (const type of ["touchstart", "touchmove"])
      blocker.addEventListener(
        type,
        (event) => {
          this.#touches = event.touches.length
          this.#consume(event)
          this.#notifyBlockedInteraction()
        },
        { passive: false },
      )
    for (const type of ["touchend", "touchcancel"])
      blocker.addEventListener(
        type,
        (event) => {
          this.#touches = event.touches.length
          this.#consume(event)
          this.#notifyBlockedInteraction()
          this.#sync()
        },
        { passive: false },
      )
    blocker.addEventListener(
      "wheel",
      (event) => {
        this.#wheel = true
        this.#releaseWheelAfterIdle()
        this.#consume(event)
        this.#notifyBlockedInteraction()
      },
      { passive: false },
    )
  }
  get active() {
    return this.#host.hasAttribute(CommittedPageTurnInputGuard.#attribute)
  }
  get requested() {
    return this.#requested
  }
  setRequested(requested) {
    this.#requested = requested
    this.#sync()
  }
  #shouldBlock() {
    return (
      this.#requested ||
      this.#pointers.size > 0 ||
      this.#touches > 0 ||
      this.#wheel
    )
  }
  #consume(event) {
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  #notifyBlockedInteraction() {
    this.#onBlockedInteraction()
  }
  #sync() {
    this.#host.toggleAttribute(
      CommittedPageTurnInputGuard.#attribute,
      this.#shouldBlock(),
    )
  }
}

class CssSnapTrack {
  #element
  #signature = null

  constructor(element) {
    this.#element = element
  }
  invalidate() {
    this.#signature = null
  }
  update({ vertical, pages, pageSize, canPrev, canNext }) {
    const signature = `${vertical}:${pages}:${pageSize}:${canPrev}:${canNext}`
    if (signature === this.#signature) return

    this.#signature = signature
    const extent = pages * pageSize
    this.#element.style.setProperty("--snap-page-size", `${pageSize}px`)
    this.#element.style.width = vertical ? "100%" : `${extent}px`
    this.#element.style.height = vertical ? `${extent}px` : "100%"

    const markers = Array.from({ length: pages }, (_, page) => {
      const marker = document.createElement("div")
      if ((page === 0 && !canPrev) || (page === pages - 1 && !canNext))
        marker.className = "disabled"
      return marker
    })
    this.#element.replaceChildren(...markers)
  }
}

const debounce = (f, wait, immediate) => {
  let timeout
  return (...args) => {
    const later = () => {
      timeout = null
      if (!immediate) f(...args)
    }
    const callNow = immediate && !timeout
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(later, wait)
    if (callNow) f(...args)
  }
}

// collapsed range doesn't return client rects sometimes (or always?)
// try make get a non-collapsed range or element
const uncollapse = (range) => {
  if (!range?.collapsed) return range
  const { endOffset, endContainer } = range
  if (endContainer.nodeType === 1) {
    const node = endContainer.childNodes[endOffset]
    if (node?.nodeType === 1) return node
    return endContainer
  }
  if (endOffset + 1 < endContainer.length)
    range.setEnd(endContainer, endOffset + 1)
  else if (endOffset > 1) range.setStart(endContainer, endOffset - 1)
  else return endContainer.parentNode
  return range
}

const makeRange = (doc, node, start, end = start) => {
  const range = doc.createRange()
  range.setStart(node, start)
  range.setEnd(node, end)
  return range
}

// use binary search to find an offset value in a text node
const bisectNode = (doc, node, cb, start = 0, end = node.nodeValue.length) => {
  if (end - start === 1) {
    const result = cb(makeRange(doc, node, start), makeRange(doc, node, end))
    return result < 0 ? start : end
  }
  const mid = Math.floor(start + (end - start) / 2)
  const result = cb(
    makeRange(doc, node, start, mid),
    makeRange(doc, node, mid, end),
  )
  return result < 0
    ? bisectNode(doc, node, cb, start, mid)
    : result > 0
      ? bisectNode(doc, node, cb, mid, end)
      : mid
}

const {
  SHOW_ELEMENT,
  SHOW_TEXT,
  SHOW_CDATA_SECTION,
  FILTER_ACCEPT,
  FILTER_REJECT,
  FILTER_SKIP,
} = NodeFilter

const filter = SHOW_ELEMENT | SHOW_TEXT | SHOW_CDATA_SECTION

// needed cause there seems to be a bug in `getBoundingClientRect()` in Firefox
// where it fails to include rects that have zero width and non-zero height
// (CSSOM spec says "rectangles [...] of which the height or width is not zero")
// which makes the visible range include an extra space at column boundaries
const getBoundingClientRect = (target) => {
  let top = Infinity,
    right = -Infinity,
    left = Infinity,
    bottom = -Infinity
  for (const rect of target.getClientRects()) {
    left = Math.min(left, rect.left)
    top = Math.min(top, rect.top)
    right = Math.max(right, rect.right)
    bottom = Math.max(bottom, rect.bottom)
  }
  return new DOMRect(left, top, right - left, bottom - top)
}

const getVisibleRange = (doc, start, end, mapRect) => {
  // first get all visible nodes
  const acceptNode = (node) => {
    const name = node.localName?.toLowerCase()
    // ignore all scripts, styles, and their children
    if (name === "script" || name === "style") return FILTER_REJECT
    if (node.nodeType === 1) {
      const { left, right } = mapRect(node.getBoundingClientRect())
      // no need to check child nodes if it's completely out of view
      if (right < start || left > end) return FILTER_REJECT
      // elements must be completely in view to be considered visible
      // because you can't specify offsets for elements
      if (left >= start && right <= end) return FILTER_ACCEPT
      // TODO: it should probably allow elements that do not contain text
      // because they can exceed the whole viewport in both directions
      // especially in scrolled mode
    } else {
      // ignore empty text nodes
      if (!node.nodeValue?.trim()) return FILTER_SKIP
      // create range to get rect
      const range = doc.createRange()
      range.selectNodeContents(node)
      const { left, right } = mapRect(range.getBoundingClientRect())
      // it's visible if any part of it is in view
      if (right >= start && left <= end) return FILTER_ACCEPT
    }
    return FILTER_SKIP
  }
  const walker = doc.createTreeWalker(doc.body, filter, { acceptNode })
  const nodes = []
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    nodes.push(node)

  // we're only interested in the first and last visible nodes
  const from = nodes[0] ?? doc.body
  const to = nodes[nodes.length - 1] ?? from

  // find the offset at which visibility changes
  const startOffset =
    from.nodeType === 1
      ? 0
      : bisectNode(doc, from, (a, b) => {
          const p = mapRect(getBoundingClientRect(a))
          const q = mapRect(getBoundingClientRect(b))
          if (p.right < start && q.left > start) return 0
          return q.left > start ? -1 : 1
        })
  const endOffset =
    to.nodeType === 1
      ? 0
      : bisectNode(doc, to, (a, b) => {
          const p = mapRect(getBoundingClientRect(a))
          const q = mapRect(getBoundingClientRect(b))
          if (p.right < end && q.left > end) return 0
          return q.left > end ? -1 : 1
        })

  const range = doc.createRange()
  range.setStart(from, startOffset)
  range.setEnd(to, endOffset)
  return range
}

const selectionIsBackward = (sel) => {
  const range = document.createRange()
  range.setStart(sel.anchorNode, sel.anchorOffset)
  range.setEnd(sel.focusNode, sel.focusOffset)
  return range.collapsed
}

const setSelectionTo = (target, collapse) => {
  let range
  if (target.startContainer) range = target.cloneRange()
  else if (target.nodeType) {
    range = document.createRange()
    range.selectNode(target)
  }
  if (range) {
    const sel = range.startContainer.ownerDocument.defaultView.getSelection()
    if (sel) {
      sel.removeAllRanges()
      if (collapse === -1) range.collapse(true)
      else if (collapse === 1) range.collapse()
      sel.addRange(range)
    }
  }
}

const getDirection = (doc) => {
  const { defaultView } = doc
  const { writingMode, direction } = defaultView.getComputedStyle(doc.body)
  const vertical =
    writingMode === "vertical-rl" || writingMode === "vertical-lr"
  const rtl =
    doc.body.dir === "rtl" ||
    direction === "rtl" ||
    doc.documentElement.dir === "rtl"
  return { vertical, rtl }
}

const getBackground = (doc) => {
  const bodyStyle = doc.defaultView.getComputedStyle(doc.body)
  return bodyStyle.backgroundColor === "rgba(0, 0, 0, 0)" &&
    bodyStyle.backgroundImage === "none"
    ? doc.defaultView.getComputedStyle(doc.documentElement).background
    : bodyStyle.background
}

const makeMarginals = (length, part) =>
  Array.from({ length }, () => {
    const div = document.createElement("div")
    const child = document.createElement("div")
    div.append(child)
    child.setAttribute("part", part)
    return div
  })

const setStylesImportant = (el, styles) => {
  const { style } = el
  for (const [k, v] of Object.entries(styles))
    style.setProperty(k, v, "important")
}

class View {
  #observer = new ResizeObserver(() => this.expand())
  #element = document.createElement("div")
  #iframe = document.createElement("iframe")
  #contentRange = document.createRange()
  #overlayer
  #vertical = false
  #rtl = false
  #column = true
  #size
  #layout = {}
  constructor({ container, onExpand }) {
    this.container = container
    this.onExpand = onExpand
    this.#iframe.setAttribute("part", "filter")
    this.#element.append(this.#iframe)
    Object.assign(this.#element.style, {
      boxSizing: "content-box",
      position: "relative",
      overflow: "hidden",
      flex: "0 0 auto",
      width: "100%",
      height: "100%",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
    })
    Object.assign(this.#iframe.style, {
      overflow: "hidden",
      border: "0",
      display: "none",
      width: "100%",
      height: "100%",
    })
    // `allow-scripts` is needed for events because of WebKit bug
    // https://bugs.webkit.org/show_bug.cgi?id=218086
    this.#iframe.setAttribute("sandbox", "allow-same-origin allow-scripts")
    this.#iframe.setAttribute("scrolling", "no")
  }
  get element() {
    return this.#element
  }
  get document() {
    return this.#iframe.contentDocument
  }
  async load(src, afterLoad, beforeRender) {
    if (typeof src !== "string") throw new Error(`${src} is not string`)
    return new Promise((resolve) => {
      this.#iframe.addEventListener(
        "load",
        () => {
          const doc = this.document
          afterLoad?.(doc)

          // it needs to be visible for Firefox to get computed style
          this.#iframe.style.display = "block"
          const { vertical, rtl } = getDirection(doc)
          const background = getBackground(doc)
          this.#iframe.style.display = "none"

          this.#vertical = vertical
          this.#rtl = rtl

          this.#contentRange.selectNodeContents(doc.body)
          const layout = beforeRender?.({ vertical, rtl, background })
          this.#iframe.style.display = "block"
          this.render(layout)
          this.#observer.observe(doc.body)

          // the resize observer above doesn't work in Firefox
          // (see https://bugzilla.mozilla.org/show_bug.cgi?id=1832939)
          // until the bug is fixed we can at least account for font load
          doc.fonts.ready.then(() => this.expand())

          resolve()
        },
        { once: true },
      )
      this.#iframe.src = src
    })
  }
  render(layout) {
    if (!layout) return
    this.#column = layout.flow !== "scrolled"
    this.#layout = layout
    if (this.#column) this.columnize(layout)
    else this.scrolled(layout)
  }
  scrolled({ gap, columnWidth }) {
    const vertical = this.#vertical
    const doc = this.document
    setStylesImportant(doc.documentElement, {
      "box-sizing": "border-box",
      padding: vertical ? `${gap}px 0` : `0 ${gap}px`,
      "column-width": "auto",
      height: "auto",
      width: "auto",
    })
    setStylesImportant(doc.body, {
      [vertical ? "max-height" : "max-width"]: `${columnWidth}px`,
      margin: "auto",
    })
    this.setImageSize()
    this.expand()
  }
  columnize({ width, height, gap, columnWidth }) {
    const vertical = this.#vertical
    this.#size = vertical ? height : width

    // Reset element/iframe to viewport size BEFORE setting CSS column styles
    // This forces CSS columns to reflow to the new viewport constraints
    // Without this, columns would fill the old expanded width from previous orientation
    const side = vertical ? "height" : "width"
    const viewportSize = vertical ? height : width
    this.#iframe.style[side] = `${viewportSize}px`
    this.#element.style[side] = `${viewportSize}px`

    const doc = this.document
    setStylesImportant(doc.documentElement, {
      "box-sizing": "border-box",
      "column-width": `${Math.trunc(columnWidth)}px`,
      "column-gap": `${gap}px`,
      "column-fill": "auto",
      ...(vertical ? { width: `${width}px` } : { height: `${height}px` }),
      padding: vertical ? `${gap / 2}px 0` : `0 ${gap / 2}px`,
      overflow: "hidden",
      // force wrap long words
      "overflow-wrap": "break-word",
      // reset some potentially problematic props
      position: "static",
      border: "0",
      margin: "0",
      "max-height": "none",
      "max-width": "none",
      "min-height": "none",
      "min-width": "none",
      // fix glyph clipping in WebKit
      "-webkit-line-box-contain": "block glyphs replaced",
    })
    setStylesImportant(doc.body, {
      "max-height": "none",
      "max-width": "none",
      margin: "0",
    })
    this.setImageSize()
    this.expand()
  }
  setImageSize() {
    const { width, height, margin, marginBottom = margin } = this.#layout
    const vertical = this.#vertical
    const doc = this.document
    for (const el of doc.body.querySelectorAll("img, svg, video")) {
      // preserve max size if they are already set
      const { maxHeight, maxWidth } = doc.defaultView.getComputedStyle(el)
      setStylesImportant(el, {
        "max-height": vertical
          ? maxHeight !== "none" && maxHeight !== "0px"
            ? maxHeight
            : "100%"
          : `${height - margin - marginBottom}px`,
        "max-width": vertical
          ? `${width - margin - marginBottom}px`
          : maxWidth !== "none" && maxWidth !== "0px"
            ? maxWidth
            : "100%",
        "object-fit": "contain",
        "page-break-inside": "avoid",
        "break-inside": "avoid",
        "box-sizing": "border-box",
      })
    }
  }
  expand() {
    const { documentElement } = this.document
    if (this.#column) {
      const side = this.#vertical ? "height" : "width"
      const otherSide = this.#vertical ? "width" : "height"
      const contentRect = this.#contentRange.getBoundingClientRect()
      const rootRect = documentElement.getBoundingClientRect()
      // offset caused by column break at the start of the page
      // which seem to be supported only by WebKit and only for horizontal writing
      const contentStart = this.#vertical
        ? 0
        : this.#rtl
          ? rootRect.right - contentRect.right
          : contentRect.left - rootRect.left
      const contentSize = contentStart + contentRect[side]
      // Epsilon absorbs 1/64px layout quantization of fractional page
      // sizes (e.g. 992.00006px at dpr 1.875), which otherwise rounds
      // a re-measured width up past an exact page multiple and adds a
      // phantom page on every expand.
      const pageCount = Math.ceil(contentSize / this.#size - 0.001)
      const expandedSize = pageCount * this.#size
      this.#element.style.padding = "0"
      this.#iframe.style[side] = `${expandedSize}px`
      this.#element.style[side] = `${expandedSize + this.#size * 2}px`
      this.#iframe.style[otherSide] = "100%"
      this.#element.style[otherSide] = "100%"
      documentElement.style[side] = `${this.#size}px`
      if (this.#overlayer) {
        this.#overlayer.element.style.margin = "0"
        this.#overlayer.element.style.left = this.#vertical
          ? "0"
          : `${this.#size}px`
        this.#overlayer.element.style.top = this.#vertical
          ? `${this.#size}px`
          : "0"
        this.#overlayer.element.style[side] = `${expandedSize}px`
        this.#overlayer.redraw()
      }
    } else {
      const side = this.#vertical ? "width" : "height"
      const otherSide = this.#vertical ? "height" : "width"
      const contentSize = documentElement.getBoundingClientRect()[side]
      const expandedSize = contentSize
      const { margin, marginBottom = margin } = this.#layout
      const padding = this.#vertical
        ? `0 ${margin}px`
        : `${margin}px 0 ${marginBottom}px`
      this.#element.style.padding = padding
      this.#iframe.style[side] = `${expandedSize}px`
      this.#element.style[side] = `${expandedSize}px`
      this.#iframe.style[otherSide] = "100%"
      this.#element.style[otherSide] = "100%"
      if (this.#overlayer) {
        this.#overlayer.element.style.margin = padding
        this.#overlayer.element.style.left = "0"
        this.#overlayer.element.style.top = "0"
        this.#overlayer.element.style[side] = `${expandedSize}px`
        this.#overlayer.redraw()
      }
    }
    this.onExpand()
  }
  set overlayer(overlayer) {
    this.#overlayer = overlayer
    this.#element.append(overlayer.element)
  }
  get overlayer() {
    return this.#overlayer
  }
  destroy() {
    if (this.document) this.#observer.unobserve(this.document.body)
  }
}

// NOTE: everything here assumes the so-called "negative scroll type" for RTL
export class Paginator extends HTMLElement {
  static observedAttributes = [
    "flow",
    "gap",
    "margin",
    "margin-bottom",
    "max-inline-size",
    "max-block-size",
    "max-column-count",
  ]
  #root = this.attachShadow({ mode: "closed" })
  #observer = new ResizeObserver(() => this.render())
  #top
  #background
  #container
  #committedPageTurnInput
  #cssSnapTrack
  #header
  #footer
  #view
  #vertical = false
  #rtl = false
  #margin = 0
  #marginBottom = 0
  #index = -1
  #anchor = 0 // anchor view to a fraction (0-1), Range, or Element
  #justAnchored = false
  #locked = false // while true, prevent any further navigation
  #styles
  #styleMap = new WeakMap()
  #mediaQuery = matchMedia("(prefers-color-scheme: dark)")
  #mediaQueryListener
  #touchPinched = false
  #touchScrolled
  #viewport = new Paginator.#ViewportOperations(this)
  #userChapterTransition = null
  #lastVisibleRange
  #scrolledFlowRestoreFrame = null
  #pageTurnSelection = new PageTurnSelectionGuard(
    () =>
      !this.#locked && !this.#viewport.active && !this.#userChapterTransition,
  )
  constructor() {
    super()
    this.#root.innerHTML = `<style>
        :host {
            display: block;
            container-type: size;
        }
        :host, #top {
            box-sizing: border-box;
            position: relative;
            overflow: hidden;
            width: 100%;
            height: 100%;
        }
        #top {
            --_gap: 7%;
            --_margin: 48px;
            --_margin-bottom: var(--_margin);
            --_max-inline-size: 720px;
            --_max-block-size: 1440px;
            --_max-column-count: 2;
            --_max-column-count-portrait: 1;
            --_max-column-count-spread: var(--_max-column-count);
            --_half-gap: calc(var(--_gap) / 2);
            --_max-width: calc(var(--_max-inline-size) * var(--_max-column-count-spread));
            --_max-height: var(--_max-block-size);
            display: grid;
            grid-template-columns:
                minmax(var(--_half-gap), 1fr)
                var(--_half-gap)
                minmax(0, calc(var(--_max-width) - var(--_gap)))
                var(--_half-gap)
                minmax(var(--_half-gap), 1fr);
            grid-template-rows:
                minmax(var(--_margin), 1fr)
                minmax(0, var(--_max-height))
                minmax(var(--_margin-bottom), 1fr);
            &.vertical {
                --_max-column-count-spread: var(--_max-column-count-portrait);
                --_max-width: var(--_max-block-size);
                --_max-height: calc(var(--_max-inline-size) * var(--_max-column-count-spread));
            }
            @container (orientation: portrait) {
                & {
                    --_max-column-count-spread: var(--_max-column-count-portrait);
                }
                &.vertical {
                    --_max-column-count-spread: var(--_max-column-count);
                }
            }
        }
        #background {
            grid-column: 1 / -1;
            grid-row: 1 / -1;
        }
        #container {
            grid-column: 2 / 5;
            grid-row: 2;
            position: relative;
            overflow: hidden;
        }
        :host([flow="scrolled"]) #container {
            grid-column: 1 / -1;
            grid-row: 1 / -1;
            overflow: auto;
        }
        :host(:not([flow="scrolled"])) #container.css-snap {
            overflow: auto;
            overscroll-behavior: none;
            scrollbar-width: none;
        }
        #page-turn-blocker {
            display: none;
            position: absolute;
            inset: 0;
            z-index: 2147483647;
            touch-action: none;
            user-select: none;
            -webkit-user-select: none;
        }
        :host([data-committed-page-turn]) #page-turn-blocker {
            display: block;
        }
        :host(:not([flow="scrolled"])) #container.css-snap::-webkit-scrollbar {
            display: none;
        }
        #snap-track {
            display: none;
            position: absolute;
            inset-block-start: 0;
            inset-inline-start: 0;
            pointer-events: none;
            opacity: 0;
        }
        #container.css-snap {
            scroll-snap-type: x mandatory;
        }
        #container.css-snap.vertical {
            scroll-snap-type: y mandatory;
        }
        #container.css-snap #snap-track {
            display: flex;
        }
        #container.css-snap.vertical #snap-track {
            flex-direction: column;
        }
        #snap-track > div {
            flex: 0 0 var(--snap-page-size);
            scroll-snap-align: start;
            scroll-snap-stop: always;
        }
        #snap-track > div.disabled {
            scroll-snap-align: none;
        }
        #header {
            grid-column: 3 / 4;
            grid-row: 1;
        }
        #footer {
            grid-column: 3 / 4;
            grid-row: 3;
            align-self: end;
        }
        #header, #footer {
            display: grid;
        }
        #header {
            height: var(--_margin);
        }
        #footer {
            height: var(--_margin-bottom);
        }
        :is(#header, #footer) > * {
            display: flex;
            align-items: center;
            min-width: 0;
        }
        :is(#header, #footer) > * > * {
            width: 100%;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            text-align: center;
            font-size: .75em;
            opacity: .6;
        }
        </style>
        <div id="top">
            <div id="background" part="filter"></div>
            <div id="header"></div>
            <div id="container">
                <div id="snap-track" aria-hidden="true"></div>
            </div>
            <div id="footer"></div>
            <div id="page-turn-blocker" aria-hidden="true"></div>
        </div>
        `

    this.#top = this.#root.getElementById("top")
    this.#background = this.#root.getElementById("background")
    this.#container = this.#root.getElementById("container")
    this.#cssSnapTrack = new CssSnapTrack(
      this.#root.getElementById("snap-track"),
    )
    this.#header = this.#root.getElementById("header")
    this.#footer = this.#root.getElementById("footer")

    this.#committedPageTurnInput = new CommittedPageTurnInputGuard({
      host: this,
      blocker: this.#root.getElementById("page-turn-blocker"),
      onBlockedInteraction: () => this.#viewport.finishCommittedPageTurn(),
    })

    this.#observer.observe(this.#container)
    this.#container.addEventListener("scroll", () => {
      this.dispatchEvent(new Event("scroll"))
      this.#viewport.handleScroll()
    })
    this.#container.addEventListener("scrollend", () =>
      this.#viewport.handleScrollEnd(),
    )
    this.#container.addEventListener(
      "scroll",
      debounce(() => {
        if (this.scrolled) {
          this.#viewport.settleContinuousScroll()
        }
      }, 250),
    )

    const opts = { passive: true }
    this.addEventListener("touchstart", this.#onTouchStart.bind(this), opts)
    this.addEventListener("touchmove", this.#onTouchMove.bind(this), opts)
    this.addEventListener("touchend", this.#onTouchEnd.bind(this))
    this.addEventListener("touchcancel", this.#onTouchEnd.bind(this))
    this.addEventListener("wheel", this.#onWheel.bind(this), {
      passive: true,
    })
    this.addEventListener("load", ({ detail: { doc } }) => {
      doc.addEventListener("touchstart", this.#onTouchStart.bind(this), opts)
      doc.addEventListener("touchmove", this.#onTouchMove.bind(this), opts)
      doc.addEventListener("touchend", this.#onTouchEnd.bind(this))
      doc.addEventListener("touchcancel", this.#onTouchEnd.bind(this))
      doc.addEventListener("wheel", this.#onWheel.bind(this), {
        passive: true,
      })
    })

    this.addEventListener("relocate", ({ detail }) => {
      if (detail.reason === "selection") setSelectionTo(this.#anchor, 0)
      else if (detail.reason === "navigation") {
        if (this.#anchor === 1) setSelectionTo(detail.range, 1)
        else if (typeof this.#anchor === "number")
          setSelectionTo(detail.range, -1)
        else setSelectionTo(this.#anchor, -1)
      }
    })
    const checkPointerSelection = debounce((range, sel) => {
      if (!sel.rangeCount) return
      const selRange = sel.getRangeAt(0)
      const backward = selectionIsBackward(sel)
      if (
        backward &&
        selRange.compareBoundaryPoints(Range.START_TO_START, range) < 0
      )
        this.prev(undefined, false)
      else if (
        !backward &&
        selRange.compareBoundaryPoints(Range.END_TO_END, range) > 0
      )
        this.next(undefined, false)
    }, 700)
    this.addEventListener("load", ({ detail: { doc } }) => {
      this.#pageTurnSelection.attach(doc)
      doc.addEventListener(
        "pointerdown",
        (e) => {
          // Mouse and pen input do not emit the touchstart that normally tells
          // the paginator a native smooth page turn was interrupted.
          // WebKit can still stop that animation on pointerdown, so enter the
          // same correction path used by touch before it settles between pages.
          if (e.pointerType !== "touch") this.#viewport.interruptCssSnap(false)
        },
        true,
      )
      let isKeyboardSelecting = false
      doc.addEventListener("keydown", () => (isKeyboardSelecting = true))
      doc.addEventListener("keyup", () => (isKeyboardSelecting = false))
      doc.addEventListener("selectionchange", () => {
        if (this.scrolled) return
        const range = this.#lastVisibleRange
        if (!range) return
        const sel = doc.getSelection()
        if (!sel.rangeCount) return
        if (
          this.#pageTurnSelection.hasActivePointer(doc) &&
          sel.type === "Range"
        )
          checkPointerSelection(range, sel)
        else if (isKeyboardSelecting) {
          const selRange = sel.getRangeAt(0).cloneRange()
          const backward = selectionIsBackward(sel)
          if (!backward) selRange.collapse()
          this.#scrollToAnchor(selRange)
        }
      })
      doc.addEventListener("focusin", (e) =>
        this.scrolled
          ? null
          : // NOTE: `requestAnimationFrame` is needed in WebKit
            requestAnimationFrame(() => this.#scrollToAnchor(e.target)),
      )
    })

    this.#mediaQueryListener = () => {
      if (!this.#view) return
      this.#background.style.background = getBackground(this.#view.document)
    }
    this.#mediaQuery.addEventListener("change", this.#mediaQueryListener)
  }
  attributeChangedCallback(name, oldValue, value) {
    switch (name) {
      case "flow":
        this.render()
        if (oldValue !== "scrolled" && value === "scrolled")
          this.#scheduleScrolledFlowRestore()
        break
      case "gap":
      case "margin":
      case "margin-bottom":
      case "max-block-size":
      case "max-column-count":
        this.#top.style.setProperty("--_" + name, value)
        break
      case "max-inline-size":
        // needs explicit `render()` as it doesn't necessarily resize
        this.#top.style.setProperty("--_" + name, value)
        this.render()
        break
    }
  }
  open(book) {
    this.bookDir = book.dir
    this.sections = book.sections
    book.transformTarget?.addEventListener("data", ({ detail }) => {
      if (detail.type !== "text/css") return
      const w = innerWidth
      const h = innerHeight
      detail.data = Promise.resolve(detail.data).then((data) =>
        data
          // unprefix as most of the props are (only) supported unprefixed
          .replace(/(?<=[{\s;])-epub-/gi, "")
          // replace vw and vh as they cause problems with layout
          .replace(
            /(\d*\.?\d+)vw/gi,
            (_, d) => (parseFloat(d) * w) / 100 + "px",
          )
          .replace(
            /(\d*\.?\d+)vh/gi,
            (_, d) => (parseFloat(d) * h) / 100 + "px",
          )
          // `page-break-*` unsupported in columns; replace with `column-break-*`
          .replace(
            /page-break-(after|before|inside)\s*:/gi,
            (_, x) => `-webkit-column-break-${x}:`,
          )
          .replace(
            /break-(after|before|inside)\s*:\s*(avoid-)?page/gi,
            (_, x, y) => `break-${x}: ${y ?? ""}column`,
          ),
      )
    })
  }
  #createView() {
    this.#viewport.reset()
    if (this.#view) {
      this.#view.destroy()
      this.#container.removeChild(this.#view.element)
    }
    this.#view = new View({
      container: this,
      onExpand: () => this.#onViewExpand(),
    })
    this.#container.append(this.#view.element)
    return this.#view
  }
  #beforeRender({ vertical, rtl, background }) {
    this.#vertical = vertical
    this.#rtl = rtl
    this.#top.classList.toggle("vertical", vertical)

    // set background to `doc` background
    // this is needed because the iframe does not fill the whole element
    this.#background.style.background = background

    const { width, height } = this.#container.getBoundingClientRect()
    const size = vertical ? height : width

    const style = getComputedStyle(this.#top)
    const maxInlineSize = parseFloat(
      style.getPropertyValue("--_max-inline-size"),
    )
    const maxColumnCount = parseInt(
      style.getPropertyValue("--_max-column-count-spread"),
    )
    const margin = parseFloat(style.getPropertyValue("--_margin"))
    const parsedMarginBottom = parseFloat(
      style.getPropertyValue("--_margin-bottom"),
    )
    const marginBottom = Number.isFinite(parsedMarginBottom)
      ? parsedMarginBottom
      : margin
    this.#margin = margin
    this.#marginBottom = marginBottom

    const g = parseFloat(style.getPropertyValue("--_gap")) / 100
    // The gap will be a percentage of the #container, not the whole view.
    // This means the outer padding will be bigger than the column gap. Let
    // `a` be the gap percentage. The actual percentage for the column gap
    // will be (1 - a) * a. Let us call this `b`.
    //
    // To make them the same, we start by shrinking the outer padding
    // setting to `b`, but keep the column gap setting the same at `a`. Then
    // the actual size for the column gap will be (1 - b) * a. Repeating the
    // process again and again, we get the sequence
    //     x₁ = (1 - b) * a
    //     x₂ = (1 - x₁) * a
    //     ...
    // which converges to x = (1 - x) * a. Solving for x, x = a / (1 + a).
    // So to make the spacing even, we must shrink the outer padding with
    //     f(x) = x / (1 + x).
    // But we want to keep the outer padding, and make the inner gap bigger.
    // So we apply the inverse, f⁻¹ = -x / (x - 1) to the column gap.
    const gap = (-g / (g - 1)) * size

    const flow = this.getAttribute("flow")
    if (flow === "scrolled") {
      // FIXME: vertical-rl only, not -lr
      this.setAttribute("dir", vertical ? "rtl" : "ltr")
      this.#top.style.padding = "0"
      const columnWidth = maxInlineSize

      this.heads = null
      this.feet = null
      this.#header.replaceChildren()
      this.#footer.replaceChildren()

      return { flow, margin, marginBottom, gap, columnWidth }
    }

    const divisor = Math.min(maxColumnCount, Math.ceil(size / maxInlineSize))
    const columnWidth = size / divisor - gap
    this.setAttribute("dir", rtl ? "rtl" : "ltr")

    const marginalDivisor = vertical
      ? Math.min(2, Math.ceil(width / maxInlineSize))
      : divisor
    const marginalStyle = {
      gridTemplateColumns: `repeat(${marginalDivisor}, 1fr)`,
      gap: `${gap}px`,
      direction: this.bookDir === "rtl" ? "rtl" : "ltr",
    }
    Object.assign(this.#header.style, marginalStyle)
    Object.assign(this.#footer.style, marginalStyle)
    const heads = makeMarginals(marginalDivisor, "head")
    const feet = makeMarginals(marginalDivisor, "foot")
    this.heads = heads.map((el) => el.children[0])
    this.feet = feet.map((el) => el.children[0])
    this.#header.replaceChildren(...heads)
    this.#footer.replaceChildren(...feet)

    return { height, width, margin, marginBottom, gap, columnWidth }
  }
  render() {
    if (!this.#view) return
    if (this.cssSnapEnabled) this.#viewport.beginReflow()
    else this.#viewport.abortReflow()
    this.#view.render(
      this.#beforeRender({
        vertical: this.#vertical,
        rtl: this.#rtl,
      }),
    )
  }
  #onViewExpand() {
    // View.render() expands synchronously, but font loading and content changes
    // can also expand the view independently. Once a viewport has settled,
    // both paths must use the same resize owner and frozen logical location.
    if (this.cssSnapEnabled) this.#viewport.beginReflow()

    this.#updateCssSnapLayout()
    if (this.scrolled) this.#resetCrossScrollOffset()
    if (!this.#viewport.layoutChanged()) this.#scrollToAnchor(this.#anchor)
  }
  #resetCrossScrollOffset() {
    // Paginated and continuous layouts use perpendicular scroll axes.
    const crossScrollProp =
      this.scrollProp === "scrollLeft" ? "scrollTop" : "scrollLeft"
    this.#container[crossScrollProp] = 0
  }
  #scheduleScrolledFlowRestore() {
    if (this.#scrolledFlowRestoreFrame !== null)
      cancelAnimationFrame(this.#scrolledFlowRestoreFrame)

    const anchor = this.#anchor?.cloneRange?.() ?? this.#anchor
    this.#scrolledFlowRestoreFrame = requestAnimationFrame(async () => {
      this.#scrolledFlowRestoreFrame = null
      if (!this.scrolled || !this.#view) return

      // Apply the preserved page anchor after WebKit commits the new overflow
      // axis, then force a real one-pixel scroll. Merely scrolling to the anchor
      // can be a no-op when it resolves to the current offset, which does not
      // wake WebKit's blank continuous viewport.
      this.#resetCrossScrollOffset()
      await this.#scrollToAnchor(anchor)
      if (!this.scrolled || !this.#view) return

      const { scrollProp } = this
      const offset = this.#container[scrollProp]
      const scrollSizeProp =
        scrollProp === "scrollLeft" ? "scrollWidth" : "scrollHeight"
      const maxOffset = Math.max(0, this.#container[scrollSizeProp] - this.size)
      const nudgedOffset =
        scrollProp === "scrollLeft" && this.#vertical
          ? offset < 0
            ? offset + 1
            : -1
          : offset < maxOffset
            ? offset + 1
            : Math.max(0, offset - 1)
      if (nudgedOffset === offset) return

      this.#container[scrollProp] = nudgedOffset
      this.#scrolledFlowRestoreFrame = requestAnimationFrame(() => {
        this.#scrolledFlowRestoreFrame = null
        if (!this.scrolled || !this.#view) return
        this.#container[scrollProp] = offset
      })
    })
  }
  #setCssSnapClass(enabled) {
    this.#container.classList.toggle("css-snap", enabled)
    this.#container.classList.toggle("vertical", enabled && this.#vertical)
  }
  #updateCssSnapLayout() {
    const enabled = !this.scrolled && this.#view
    const snapActive = enabled && this.#viewport.snapRestored
    this.#setCssSnapClass(Boolean(snapActive))

    if (!enabled) {
      this.#viewport.disableCssSnap()
      this.#cssSnapTrack.invalidate()
      return
    }

    const { width, height } = this.#container.getBoundingClientRect()
    this.#viewport.recordLayoutViewport(width, height)
    const { pages, size } = this
    this.#cssSnapTrack.update({
      vertical: this.#vertical,
      pages,
      pageSize: size,
      canPrev: this.#adjacentIndex(-1) != null,
      canNext: this.#adjacentIndex(1) != null,
    })
  }

  /**
   * Owns asynchronous viewport movement and ensures each scroll event settles
   * against the operation that caused it. CSS-snap movement, continuous-scroll
   * navigation, and reflow are mutually exclusive operation types; starting a
   * replacement explicitly resolves or preserves the operation it supersedes.
   *
   * A reflow operation freezes the last committed visible range, disables snap,
   * and follows this state machine:
   *
   * Normal path:
   *
   *   resize/restart (from any state)
   *                 |
   *                 v
   *          +------------+   align range; restore snap   +------------+
   *          |   layout   | ----------------------------> |   verify   |
   *          +------------+                               +------------+
   *                                                              |
   *                                                   aligned or limit reached
   *                                                              |
   *                                                              v
   *                                                       +------------+
   *                                                       |   drain    |
   *                                                       +------------+
   *                                                              |
   *                                                       quiet for 200 ms
   *                                                              |
   *                                                              v
   *                                                          complete
   *
   * Correction loop, available from both `verify` and `drain`:
   *
   *          +---------------------+
   *          | `verify` or `drain` |
   *          +---------------------+
   *                    |
   *          viewport moved and
   *          correction remains
   *                    |
   *                    v
   *             disable snap
   *                    |
   *                    v
   *          realign frozen range
   *                    |
   *                    v
   *             restore snap
   *                    |
   *                    v
   *               `verify`
   *
   * Layout or scroll activity increments the revision and reschedules the
   * current phase, invalidating stale frames and timers. An active touch holds
   * the current phase until touchend or touchcancel reschedules it.
   */
  static #ViewportOperations = class {
    #paginator
    #reflow = null
    #cssSnap = null
    #continuous = null
    #resumeCommittedPageTurnFrame = null
    #gestureInProgress = false
    #lastPage = null
    #committedAnchor = null
    #layoutViewport = null
    #settleCssSnapAfterIdle = debounce((operation) => {
      if (this.#cssSnap === operation) this.#settleCssSnap(operation, true)
    }, 200)

    constructor(paginator) {
      this.#paginator = paginator
    }
    /** Whether an asynchronous viewport operation owns movement or settlement. */
    get active() {
      return Boolean(this.#reflow || this.#cssSnap || this.#continuous)
    }
    /** Whether resize/reflow currently owns viewport movement. */
    get reflowActive() {
      return Boolean(this.#reflow)
    }
    /** Whether the current CSS-snap operation is a user page gesture. */
    get userPageTurn() {
      return (
        this.#cssSnap?.reason === "snap" &&
        this.#cssSnap.userInitiated !== false
      )
    }
    /** Whether CSS snap is available to the paginator in the current phase. */
    get snapRestored() {
      return !this.#reflow || this.#reflow.snapRestored
    }
    /** Records the settled logical viewport position to preserve on reflow. */
    commitViewport(anchor) {
      this.#committedAnchor = this.#cloneAnchor(anchor)
    }
    /** Records the viewport dimensions used to detect scroll-before-resize. */
    recordLayoutViewport(width, height) {
      this.#layoutViewport = { width, height }
    }
    /** Cancels active work and forgets the recorded viewport and anchor. */
    reset() {
      this.cancel()
      this.#committedAnchor = null
      this.#layoutViewport = null
    }
    /**
     * Starts a transaction or restarts its layout phase for another resize.
     * @returns {boolean} Whether a valid committed anchor could be preserved.
     */
    beginReflow() {
      let transaction = this.#reflow
      if (transaction) {
        transaction.phase = "layout"
        transaction.realignments = 0
        if (transaction.snapRestored) this.#disableSnap(transaction)
        this.#scheduleReflowAdvance(transaction)
        return true
      }

      const anchor = this.#cloneAnchor(this.#committedAnchor)
      if (!this.#anchorBelongsToView(anchor)) return false

      const container = this.#paginator.#container
      let resolveDone
      transaction = {
        anchor,
        revision: 0,
        frame: null,
        timer: null,
        phase: "layout",
        realignments: 0,
        anchorOffset: null,
        snapRestored: false,
        scrollBehavior: container.style.getPropertyValue("scroll-behavior"),
        scrollBehaviorPriority:
          container.style.getPropertyPriority("scroll-behavior"),
        done: new Promise((resolve) => (resolveDone = resolve)),
        resolveDone,
        resumeNavigation: null,
      }
      this.#reflow = transaction
      this.#continuous = null

      const pending = this.#cssSnap
      this.#cssSnap = null
      if (pending?.reason === "navigation" || pending?.reason === "selection") {
        transaction.resumeNavigation = {
          anchor: this.#cloneAnchor(this.#paginator.#anchor),
          reason: pending.reason,
          resolve: pending.resolve,
        }
      } else pending?.resolve?.(false)

      this.#gestureInProgress = false
      if (this.#resumeCommittedPageTurnFrame !== null) {
        cancelAnimationFrame(this.#resumeCommittedPageTurnFrame)
        this.#resumeCommittedPageTurnFrame = null
      }
      this.#disableSnap(transaction)
      this.#scheduleReflowAdvance(transaction)
      return true
    }
    /**
     * Aligns the frozen anchor after repagination and restarts settlement.
     * @returns {boolean} Whether an active transaction handled the change.
     */
    layoutChanged() {
      const transaction = this.#reflow
      if (!transaction) return false
      this.#align(transaction)
      this.#scheduleReflowAdvance(transaction)
      return true
    }
    /**
     * Routes paginated scroll activity to reflow or the current CSS-snap owner.
     * A viewport size mismatch starts reflow before ResizeObserver can report it.
     * @returns {boolean} Whether the event belongs to paginated viewport motion.
     */
    handleScroll() {
      if (this.#paginator.scrolled) return false
      if (this.#handleReflowActivity()) return true

      const viewport = this.#paginator.#container.getBoundingClientRect()
      const layout = this.#layoutViewport
      if (
        this.#committedAnchor &&
        layout &&
        (Math.abs(viewport.width - layout.width) > 0.5 ||
          Math.abs(viewport.height - layout.height) > 0.5)
      ) {
        // A native snap adjustment can dispatch scroll before ResizeObserver.
        // Claim it immediately; the observer renders into this transaction.
        this.beginReflow()
        return true
      }
      if (!this.#cssSnap) {
        this.#cssSnap = { reason: "snap" }
        this.#gestureInProgress = true
      }
      const operation = this.#cssSnap
      operation.scrollStarted = true
      // Native scrollend is the only sound way to delimit wheel/trackpad input;
      // an idle pause can occur before that gesture has actually settled. Keep
      // the fallback for programmatic moves, engines without scrollend, and a
      // touch fallback that was explicitly armed on touchend/cancel.
      if (
        operation.reason !== "snap" ||
        !("onscrollend" in this.#paginator.#container) ||
        operation.idleFallback
      )
        this.armCssSnapIdleFallback(operation)
      return true
    }
    /** Resolves after the active transaction and any immediate restart finish. */
    async wait() {
      while (this.#reflow) await this.#reflow.done
    }
    /** Settles a native scrollend against its current viewport operation. */
    handleScrollEnd() {
      if (!this.#handleReflowActivity())
        this.#settleCssSnap(this.#cssSnap, false)
    }
    /** Starts a programmatic CSS-snap operation, superseding its predecessor. */
    beginCssSnap(
      reason,
      resolve,
      needsSnapCorrection = false,
      userInitiated = true,
    ) {
      this.#cancelCssSnap()
      this.#continuous = null
      const operation = {
        reason,
        resolve,
        needsSnapCorrection,
        userInitiated,
        scrollStarted: false,
        targetCorrectionAttempted: false,
      }
      this.#cssSnap = operation
      return operation
    }
    /** Arms the identity-checked idle fallback for a CSS-snap operation. */
    armCssSnapIdleFallback(operation) {
      if (this.#cssSnap !== operation) return
      operation.idleFallback = true
      this.#settleCssSnapAfterIdle(operation)
    }
    /**
     * Replaces an interrupted programmatic snap with a possible user gesture.
     */
    interruptCssSnap(userInitiated = false) {
      if (this.#paginator.#committedPageTurnInput.active) return
      const pending = this.#cssSnap
      if (!pending || pending.reason === "snap") return
      // A touchstart can be either a drag that interrupts the smooth scroll or
      // a tap handled by the native margin zones. Do not report a user page turn
      // until touchmove confirms a drag; otherwise the native tap navigation is
      // rejected while this interrupted scroll is waiting to settle.
      const replacement = {
        reason: "snap",
        needsSnapCorrection: true,
        userInitiated,
        // This owner adopts motion that already started under `pending`. A
        // pointerdown can stop it without producing another scroll event.
        scrollStarted: true,
        targetCorrectionAttempted: false,
      }
      this.#cssSnap = replacement
      this.#gestureInProgress = true
      pending.resolve?.(false)
      this.armCssSnapIdleFallback(replacement)
    }
    /** Records the beginning of touch input that may become a page gesture. */
    beginGesture(page) {
      this.#continuous = null
      this.#gestureInProgress = true
      this.#lastPage = page
    }
    /** Marks an adopted CSS-snap operation as confirmed user dragging. */
    confirmGesture() {
      if (this.#cssSnap?.reason === "snap") this.#cssSnap.userInitiated = true
    }
    /** Rearms settlement after every touch has ended or been cancelled. */
    endTouch() {
      if (!this.#handleReflowActivity() && this.#cssSnap?.reason === "snap")
        this.armCssSnapIdleFallback(this.#cssSnap)
    }
    /** Cancels gesture-owned operations in response to wheel or pointer input. */
    interruptFromInput(userInitiated) {
      this.#continuous = null
      this.interruptCssSnap(userInitiated)
    }
    /** Records an animated navigation in continuous-scroll mode. */
    beginContinuousScroll(reason) {
      this.#cancelCssSnap()
      this.#continuous = { reason }
    }
    /** Commits continuous-scroll movement after its debounce interval. */
    settleContinuousScroll() {
      const operation = this.#continuous
      this.#continuous = null
      if (operation) {
        this.#paginator.#afterScroll(operation.reason)
        this.#paginator.#justAnchored = false
      } else if (this.#paginator.#justAnchored)
        this.#paginator.#justAnchored = false
      else this.#paginator.#afterScroll("scroll")
      this.#paginator.#pageTurnSelection.releaseIfSettled()
    }
    /** Emits page-flip semantics only for movement owned by a user gesture. */
    reportPageFlip(reason) {
      const page = this.#paginator.page
      if (
        reason === "snap" &&
        this.#gestureInProgress &&
        page !== this.#lastPage
      ) {
        this.#paginator.dispatchEvent(
          new CustomEvent("page-flip", {
            detail: { fromPage: this.#lastPage, toPage: page },
            bubbles: true,
            composed: true,
          }),
        )
        this.#gestureInProgress = false
      }
      this.#lastPage = page
    }
    /** Finishes a Swift-committed page turn after consuming blocked input. */
    finishCommittedPageTurn() {
      const operation = this.#cssSnap
      if (
        this.#resumeCommittedPageTurnFrame !== null ||
        !this.#paginator.#committedPageTurnInput.requested ||
        !Number.isFinite(operation?.targetOffset)
      )
        return

      // Physical input can stop native smooth scrolling even when the blocker
      // consumes its DOM event. Ignore that animation's stale scrollend, then
      // force its committed target after WebKit has processed the input.
      operation.scrollStarted = false
      this.armCssSnapIdleFallback(operation)
      this.#resumeCommittedPageTurnFrame = requestAnimationFrame(() => {
        this.#resumeCommittedPageTurnFrame = null
        if (
          this.#cssSnap !== operation ||
          !this.#paginator.#committedPageTurnInput.requested
        )
          return

        const { scrollProp } = this.#paginator
        const offset = this.#paginator.#container[scrollProp]
        if (Math.abs(offset - operation.targetOffset) <= 1) return

        const axis = scrollProp === "scrollLeft" ? "left" : "top"
        this.#paginator.#container.scrollTo({
          [axis]: operation.targetOffset,
          behavior: "auto",
        })
        this.armCssSnapIdleFallback(operation)
      })
    }
    /** Cancels paginated movement without disturbing continuous navigation. */
    disableCssSnap() {
      this.#cancelCssSnap()
      this.#gestureInProgress = false
      if (this.#resumeCommittedPageTurnFrame !== null) {
        cancelAnimationFrame(this.#resumeCommittedPageTurnFrame)
        this.#resumeCommittedPageTurnFrame = null
      }
      this.#paginator.#pageTurnSelection.releaseIfSettled()
    }
    /** Cancels all viewport ownership and resolves interrupted promises. */
    cancel() {
      this.abortReflow()
      this.disableCssSnap()
      this.#continuous = null
      this.#paginator.#pageTurnSelection.releaseIfSettled()
    }
    /** Cancels the active transaction and resolves its pending work as aborted. */
    abortReflow() {
      const transaction = this.#reflow
      if (!transaction) return
      if (transaction.frame !== null) cancelAnimationFrame(transaction.frame)
      if (transaction.timer !== null) clearTimeout(transaction.timer)
      this.#restoreScrollBehavior(transaction)
      this.#reflow = null
      transaction.resumeNavigation?.resolve?.(false)
      transaction.resolveDone()
      this.#paginator.#pageTurnSelection.releaseIfSettled()
    }
    #cancelCssSnap() {
      const operation = this.#cssSnap
      this.#cssSnap = null
      operation?.resolve?.(false)
    }
    #settleCssSnap(operation, fromIdleFallback) {
      const paginator = this.#paginator
      if (paginator.scrolled) return
      if (this.#handleReflowActivity()) return
      if (
        !operation ||
        this.#cssSnap !== operation ||
        paginator.#pageTurnSelection.touchActive
      )
        return

      // A native scrollend from a superseded operation can arrive after its
      // replacement is installed. It cannot settle the replacement before that
      // operation has produced scroll activity of its own.
      if (!fromIdleFallback && !operation.scrollStarted) return

      const { reason, resolve, needsSnapCorrection, userInitiated } = operation
      const { scrollProp } = paginator
      const offset = paginator.#container[scrollProp]
      if (
        Number.isFinite(operation.targetOffset) &&
        Math.abs(offset - operation.targetOffset) > 1
      ) {
        if (!fromIdleFallback) {
          this.armCssSnapIdleFallback(operation)
          return
        }
        // Correct a blocked Swift page turn once. Other targets may legitimately
        // be clamped or adjusted by CSS snap and must not loop indefinitely.
        if (
          paginator.#committedPageTurnInput.requested &&
          !operation.targetCorrectionAttempted
        ) {
          operation.targetCorrectionAttempted = true
          operation.scrollStarted = false
          paginator.#container[scrollProp] = operation.targetOffset
          this.armCssSnapIdleFallback(operation)
          return
        }
      }
      this.#cssSnap = null

      if (!paginator.#touchScrolled && globalThis.visualViewport.scale === 1) {
        const { size, page } = paginator
        const pageOffset = size * (paginator.#rtl ? -page : page)
        // WebKit can stop an interrupted smooth scroll between snap positions.
        // Correct only the adopted programmatic move, never a normal fling.
        if (needsSnapCorrection && Math.abs(offset - pageOffset) > 1) {
          const correction = this.beginCssSnap(
            reason,
            resolve,
            false,
            userInitiated,
          )
          correction.targetOffset = pageOffset
          paginator.#container[scrollProp] = pageOffset
          this.armCssSnapIdleFallback(correction)
          return
        }
        paginator.#finishCssSnap(reason)
      }
      this.#gestureInProgress = false
      resolve?.(true)
      paginator.#pageTurnSelection.releaseIfSettled()
    }
    #handleReflowActivity() {
      const transaction = this.#reflow
      if (!transaction) return false
      this.#scheduleReflowAdvance(transaction)
      return true
    }
    #cloneAnchor(anchor) {
      return anchor?.cloneRange?.() ?? anchor
    }
    #anchorBelongsToView(anchor) {
      if (typeof anchor === "number") return true
      const node = anchor?.startContainer ?? anchor
      return node?.ownerDocument === this.#paginator.#view?.document
    }
    #disableSnap(transaction) {
      if (this.#reflow !== transaction) return
      transaction.snapRestored = false
      this.#paginator.#setCssSnapClass(false)
      const container = this.#paginator.#container
      container.style.setProperty("scroll-behavior", "auto", "important")

      // Removing the snap points prevents a new snap, while an auto scroll to
      // the current position terminates an in-flight native smooth scroll.
      const { scrollLeft, scrollTop } = container
      container.scrollTo({
        left: scrollLeft,
        top: scrollTop,
        behavior: "auto",
      })
    }
    #align(transaction) {
      if (
        this.#reflow !== transaction ||
        !this.#anchorBelongsToView(transaction.anchor)
      )
        return
      this.#paginator
        .#scrollToAnchor(transaction.anchor, "anchor", false, false)
        .catch((error) =>
          console.warn(
            "Failed to preserve the viewport during repagination",
            error,
          ),
        )
    }
    #scheduleReflowAdvance(transaction) {
      if (this.#reflow !== transaction) return
      transaction.revision++
      if (transaction.frame !== null) cancelAnimationFrame(transaction.frame)
      if (transaction.timer !== null) {
        clearTimeout(transaction.timer)
        transaction.timer = null
      }
      const { revision } = transaction

      // Wait through one rendered frame before advancing in the next. This gives
      // ResizeObserver, native snap adjustment, and generated scroll events time
      // to schedule another revision and invalidate this one.
      transaction.frame = requestAnimationFrame(() => {
        if (!this.#isCurrentReflowRevision(transaction, revision)) return
        transaction.frame = requestAnimationFrame(() => {
          transaction.frame = null
          this.#advanceReflow(transaction, revision)
        })
      })
    }
    #isCurrentReflowRevision(transaction, revision) {
      return this.#reflow === transaction && transaction.revision === revision
    }
    #advanceReflow(transaction, revision) {
      if (
        !this.#isCurrentReflowRevision(transaction, revision) ||
        this.#paginator.#pageTurnSelection.touchActive
      )
        return

      if (transaction.phase === "layout") {
        this.#alignAndRestoreSnap(transaction)
        return
      }

      const offset = this.#paginator.#container[this.#paginator.scrollProp]
      const moved =
        Number.isFinite(transaction.anchorOffset) &&
        Math.abs(offset - transaction.anchorOffset) > 1
      if (moved && transaction.realignments < 2) {
        transaction.realignments++
        this.#disableSnap(transaction)
        this.#alignAndRestoreSnap(transaction)
      } else if (transaction.phase === "verify") {
        // Keep resize ownership for a separate quiet phase so scroll and
        // scrollend generated by restoring snap cannot become user motion.
        transaction.phase = "drain"
        this.#scheduleReflowAdvance(transaction)
      } else this.#scheduleReflowCompletion(transaction)
    }
    #alignAndRestoreSnap(transaction) {
      this.#align(transaction)
      transaction.anchorOffset =
        this.#paginator.#container[this.#paginator.scrollProp]
      transaction.snapRestored = true
      transaction.phase = "verify"
      this.#paginator.#updateCssSnapLayout()
      this.#scheduleReflowAdvance(transaction)
    }
    #scheduleReflowCompletion(transaction) {
      const { revision } = transaction
      transaction.timer = setTimeout(() => {
        transaction.timer = null
        if (this.#isCurrentReflowRevision(transaction, revision))
          this.#complete(transaction)
      }, 200)
    }
    #restoreScrollBehavior(transaction) {
      const style = this.#paginator.#container.style
      if (transaction.scrollBehavior)
        style.setProperty(
          "scroll-behavior",
          transaction.scrollBehavior,
          transaction.scrollBehaviorPriority,
        )
      else style.removeProperty("scroll-behavior")
    }
    #complete(transaction) {
      if (this.#reflow !== transaction) return

      // Publish page metrics without committing resize motion as navigation.
      this.#paginator.#afterScroll("anchor", false)
      this.#restoreScrollBehavior(transaction)
      this.#reflow = null

      const resume = transaction.resumeNavigation
      const finish = () => {
        transaction.resolveDone()
        this.#paginator.#pageTurnSelection.releaseIfSettled()
      }
      if (resume && this.#anchorBelongsToView(resume.anchor)) {
        this.#paginator.#scrollToAnchor(resume.anchor, resume.reason).then(
          (completed) => {
            resume.resolve?.(completed !== false)
            finish()
          },
          () => {
            resume.resolve?.(false)
            finish()
          },
        )
      } else {
        resume?.resolve?.(false)
        finish()
      }
    }
  }
  get scrolled() {
    return this.getAttribute("flow") === "scrolled"
  }
  get cssSnapEnabled() {
    return !this.scrolled
  }
  get pageTurnBlocksNavigation() {
    const committedPageTurn = this.#committedPageTurnInput.requested
    const gesturePageTurn =
      Boolean(this.#userChapterTransition) || this.#viewport.userPageTurn

    return committedPageTurn || gesturePageTurn
  }
  get scrollProp() {
    const { scrolled } = this
    return this.#vertical
      ? scrolled
        ? "scrollLeft"
        : "scrollTop"
      : scrolled
        ? "scrollTop"
        : "scrollLeft"
  }
  get sideProp() {
    const { scrolled } = this
    return this.#vertical
      ? scrolled
        ? "width"
        : "height"
      : scrolled
        ? "height"
        : "width"
  }
  get size() {
    return this.#container.getBoundingClientRect()[this.sideProp]
  }
  get viewSize() {
    return this.#view.element.getBoundingClientRect()[this.sideProp]
  }
  get start() {
    return Math.abs(this.#container[this.scrollProp])
  }
  get end() {
    return this.start + this.size
  }
  get page() {
    return Math.floor((this.start + this.end) / 2 / this.size)
  }
  get pages() {
    return Math.round(this.viewSize / this.size)
  }
  #finishCssSnap(reason) {
    const page = this.page
    const { pages } = this
    const dir =
      page <= 0 //
        ? -1
        : page >= pages - 1
          ? 1
          : null
    if (reason === "snap" && dir) return this.#finishBoundaryCssSnap(dir)
    this.#afterScroll(reason)
  }
  #finishBoundaryCssSnap(dir) {
    const index = this.#adjacentIndex(dir)
    if (index == null) {
      this.#afterScroll("snap")
      return
    }

    // Publish the boundary relocation while the turn is still active, then
    // keep it active until the adjacent section emits its final relocation.
    const transition = {
      index,
      anchor: dir < 0 ? () => 1 : () => 0,
    }
    this.#userChapterTransition = transition
    this.#afterScroll("snap")

    const navigation = this.#goTo(transition)
    const settle = () => {
      this.#finishUserChapterTransition(transition)
    }
    navigation.then(settle, settle)
    return navigation
  }
  #finishUserChapterTransition(transition) {
    if (this.#userChapterTransition !== transition) return
    this.#userChapterTransition = null
    this.#pageTurnSelection.releaseIfSettled()
  }
  #onWheel() {
    if (this.#committedPageTurnInput.active) return
    this.#viewport.interruptFromInput(true)
  }
  #onTouchStart() {
    this.#pageTurnSelection.startTouch()
    this.#viewport.interruptFromInput(false)
    this.#touchPinched = false
    this.#viewport.beginGesture(this.page)
  }
  #onTouchMove(e) {
    if (this.#touchPinched) return
    this.#touchPinched = globalThis.visualViewport.scale > 1
    if (this.scrolled || this.#touchPinched) return
    if (e.touches.length > 1) return
    this.#touchScrolled = true
    this.#viewport.confirmGesture()
  }
  #onTouchEnd(e) {
    this.#touchScrolled = false
    this.#pageTurnSelection.endTouch(e)
    if (this.scrolled) return
    this.#viewport.endTouch()
  }
  // allows one to process rects as if they were LTR and horizontal
  #getRectMapper() {
    if (this.scrolled) {
      const size = this.viewSize
      const margin = this.#margin
      return this.#vertical
        ? ({ left, right }) => ({
            left: size - right - margin,
            right: size - left - margin,
          })
        : ({ top, bottom }) => ({ left: top + margin, right: bottom + margin })
    }
    const pxSize = this.pages * this.size
    return this.#rtl
      ? ({ left, right }) => ({ left: pxSize - right, right: pxSize - left })
      : this.#vertical
        ? ({ top, bottom }) => ({ left: top, right: bottom })
        : (f) => f
  }
  async #scrollToRect(rect, reason, smooth) {
    if (this.scrolled) {
      const mapped = this.#getRectMapper()(rect)
      const rectCenter = (mapped.left + mapped.right) / 2
      const offset = rectCenter - this.size / 2
      return this.#scrollTo(offset, reason, smooth)
    }
    const offset = this.#getRectMapper()(rect).left
    return this.#scrollToPage(
      Math.floor(offset / this.size) + (this.#rtl ? -1 : 1),
      reason,
      smooth,
    )
  }
  async #scrollTo(offset, reason, smooth) {
    const element = this.#container
    const { scrollProp } = this
    const shouldAnimate = smooth && this.#shouldAnimateScrolling()
    if (this.#viewport.reflowActive) {
      element[scrollProp] = offset
      return
    }
    // FIXME: vertical-rl only, not -lr
    if (this.scrolled && this.#vertical) offset = -offset
    if (this.scrolled) {
      // Centering an anchor near either end of a section can produce a target
      // outside the scrollable range. WebKit clamps that target without
      // necessarily emitting `scroll`, so navigation clients waiting for the
      // resulting relocation (including read-aloud highlighting) never get a
      // chance to finish. Normalize it before detecting a no-op so even an
      // edge-clamped navigation is committed.
      const scrollSizeProp =
        scrollProp === "scrollLeft" ? "scrollWidth" : "scrollHeight"
      const maxOffset = Math.max(0, element[scrollSizeProp] - this.size)
      offset = this.#vertical
        ? Math.max(-maxOffset, Math.min(0, offset))
        : Math.max(0, Math.min(maxOffset, offset))
    }
    if (element[scrollProp] === offset) {
      this.#afterScroll(reason)
      return
    }
    if (shouldAnimate && this.scrolled) {
      const axis = scrollProp === "scrollLeft" ? "left" : "top"
      this.#viewport.beginContinuousScroll(reason)
      element.scrollTo({ [axis]: offset, behavior: "smooth" })
      return
    }
    if (shouldAnimate) return this.#cssSnapPageScrollTo(offset, reason)
    if (!this.scrolled) {
      return new Promise((resolve) => {
        const pending = this.#viewport.beginCssSnap(reason, resolve)
        pending.targetOffset = offset
        element[scrollProp] = offset
        this.#viewport.armCssSnapIdleFallback(pending)
      })
    } else {
      element[scrollProp] = offset
      this.#afterScroll(reason)
    }
  }
  #shouldAnimateScrolling() {
    return (
      this.hasAttribute("animated") &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    )
  }
  #cssSnapPageScrollTo(offset, reason) {
    const element = this.#container
    const axis = this.scrollProp === "scrollLeft" ? "left" : "top"

    return new Promise((resolve) => {
      const pending = this.#viewport.beginCssSnap(reason, resolve)
      pending.targetOffset = offset
      element.scrollTo({ [axis]: offset, behavior: "smooth" })
      this.#viewport.armCssSnapIdleFallback(pending)
    })
  }
  async #scrollToPage(page, reason, smooth) {
    const offset = this.size * (this.#rtl ? -page : page)
    return this.#scrollTo(offset, reason, smooth)
  }
  async scrollToAnchor(anchor, select, smooth = false) {
    return this.#scrollToAnchor(
      anchor,
      select ? "selection" : "navigation",
      smooth,
    )
  }
  async #scrollToAnchor(
    anchor,
    reason = "anchor",
    smooth = false,
    updateAnchor = true,
  ) {
    if (updateAnchor) {
      if (this.#viewport.reflowActive) await this.#viewport.wait()
      this.#anchor = anchor
    }
    const rects = uncollapse(anchor)?.getClientRects?.()
    // if anchor is an element or a range
    if (rects) {
      const rectList = Array.from(rects).filter(
        (r) => r.width > 0 && r.height > 0,
      )
      if (this.scrolled && rectList.length) {
        const mappedRects = rectList.map((r) => this.#getRectMapper()(r))
        const start = Math.min(...mappedRects.map((r) => r.left))
        const end = Math.max(...mappedRects.map((r) => r.right))
        await this.#scrollTo((start + end) / 2 - this.size / 2, reason, smooth)
        return
      }
      // when the start of the range is immediately after a hyphen in the
      // previous column, there is an extra zero width rect in that column
      const rect = rectList[0] || rects[0]
      if (!rect) return
      await this.#scrollToRect(rect, reason, smooth)
      return
    }
    // if anchor is a fraction
    if (this.scrolled) {
      await this.#scrollTo(anchor * this.viewSize, reason, smooth)
      return
    }
    const { pages } = this
    if (!pages) return
    const textPages = pages - 2
    const newPage = Math.round(anchor * (textPages - 1))
    await this.#scrollToPage(newPage + 1, reason, smooth)
  }
  #getVisibleRange() {
    if (this.scrolled)
      return getVisibleRange(
        this.#view.document,
        this.start + this.#margin,
        this.end - this.#marginBottom,
        this.#getRectMapper(),
      )
    const size = this.#rtl ? -this.size : this.size
    return getVisibleRange(
      this.#view.document,
      this.start - size,
      this.end - size,
      this.#getRectMapper(),
    )
  }
  /**
   * Records why the viewport moved. The reason identifies who owns the
   * relocation and controls selection, history, and page-flip reporting.
   *
   * @param {"snap"|"page"|"scroll"|"navigation"|"selection"|"anchor"|null} reason
   *   The source of the relocation:
   *   - "snap": user pagination gesture
   *   - "page": programmatic previous/next page command
   *   - "scroll": user movement in continuous-scroll mode
   *   - "navigation": explicit jump to a location, including read-aloud
   *     follow-along
   *   - "selection": jump to and select a location
   *   - "anchor": internal repositioning that preserves the current location
   *   - null: incremental programmatic movement in continuous-scroll mode
   * @param {boolean} commitViewport Whether to replace the settled logical
   *   viewport position preserved by future reflows. Reflow completion passes
   *   `false` because its generated movement must not become a new position.
   */
  #afterScroll(reason, commitViewport = true) {
    const range = this.#getVisibleRange()
    this.#lastVisibleRange = range
    if (commitViewport) this.#viewport.commitViewport(range)
    // don't set new anchor if relocation was to scroll to anchor
    if (
      reason !== "selection" &&
      reason !== "navigation" &&
      reason !== "anchor"
    )
      this.#anchor = range
    else this.#justAnchored = true

    this.#viewport.reportPageFlip(reason)

    const index = this.#index
    const detail = { reason, range, index }
    if (this.scrolled) detail.fraction = this.start / this.viewSize
    else if (this.pages > 0) {
      const { page, pages } = this
      this.#header.style.visibility = page > 1 ? "visible" : "hidden"
      detail.fraction = (page - 1) / (pages - 2)
      detail.size = 1 / (pages - 2)
    }
    this.dispatchEvent(new CustomEvent("relocate", { detail }))
  }
  async #display(promise) {
    const { index, src, anchor, onLoad, select, smooth } = await promise
    this.#index = index
    const hasFocus = this.#view?.document?.hasFocus()
    if (src) {
      const view = this.#createView()
      const afterLoad = (doc) => {
        if (doc.head) {
          const $styleBefore = doc.createElement("style")
          doc.head.prepend($styleBefore)
          const $style = doc.createElement("style")
          doc.head.append($style)
          this.#styleMap.set(doc, [$styleBefore, $style])
        }
        onLoad?.({ doc, index })
      }
      const beforeRender = this.#beforeRender.bind(this)
      await view.load(src, afterLoad, beforeRender)
      this.dispatchEvent(
        new CustomEvent("create-overlayer", {
          detail: {
            doc: view.document,
            index,
            attach: (overlayer) => (view.overlayer = overlayer),
          },
        }),
      )
      this.#view = view
    }
    await this.scrollToAnchor(
      (typeof anchor === "function" ? anchor(this.#view.document) : anchor) ??
        0,
      select,
      smooth,
    )
    if (hasFocus) this.focusView()
  }
  #canGoToIndex(index) {
    return index >= 0 && index <= this.sections.length - 1
  }
  async #goTo({ index, anchor, select, smooth }) {
    if (index === this.#index)
      await this.#display({ index, anchor, select, smooth })
    else {
      const oldIndex = this.#index
      const onLoad = (detail) => {
        this.sections[oldIndex]?.unload?.()
        this.setStyles(this.#styles)
        this.dispatchEvent(new CustomEvent("load", { detail }))
      }
      await this.#display(
        Promise.resolve(this.sections[index].load())
          .then((src) => ({ index, src, anchor, onLoad, select, smooth }))
          .catch((e) => {
            console.warn(e)
            console.warn(new Error(`Failed to load section ${index}`))
            return {}
          }),
      )
    }
  }
  async goTo(target) {
    if (this.#locked) return
    const resolved = await target
    await this.#viewport.wait()
    if (this.#canGoToIndex(resolved.index)) return this.#goTo(resolved)
  }
  async #scrollPrev(distance, animated) {
    if (!this.#view) return { status: "rejected", shouldGo: false }
    if (this.scrolled) {
      if (this.start > 0) {
        const completed = await this.#scrollTo(
          Math.max(0, this.start - (distance ?? this.size)),
          null,
          animated,
        )
        return {
          status: completed === false ? "interrupted" : "completed",
          shouldGo: false,
        }
      }
      return { status: "completed", shouldGo: true }
    }
    if (this.atStart) return { status: "rejected", shouldGo: false }
    const page = this.page - 1
    const completed = await this.#scrollToPage(page, "page", animated)
    return {
      status: completed === false ? "interrupted" : "completed",
      shouldGo: completed !== false && page <= 0,
    }
  }
  async #scrollNext(distance, animated) {
    if (!this.#view) return { status: "completed", shouldGo: true }
    if (this.scrolled) {
      if (this.viewSize - this.end > 2) {
        const completed = await this.#scrollTo(
          Math.min(this.viewSize, distance ? this.start + distance : this.end),
          null,
          animated,
        )
        return {
          status: completed === false ? "interrupted" : "completed",
          shouldGo: false,
        }
      }
      return { status: "completed", shouldGo: true }
    }
    if (this.atEnd) return { status: "rejected", shouldGo: false }
    const page = this.page + 1
    const pages = this.pages
    const completed = await this.#scrollToPage(page, "page", animated)
    return {
      status: completed === false ? "interrupted" : "completed",
      shouldGo: completed !== false && page >= pages - 1,
    }
  }
  get atStart() {
    return this.#adjacentIndex(-1) == null && this.page <= 1
  }
  get atEnd() {
    return this.#adjacentIndex(1) == null && this.page >= this.pages - 2
  }
  #adjacentIndex(dir) {
    for (let index = this.#index + dir; this.#canGoToIndex(index); index += dir)
      if (this.sections[index]?.linear !== "no") return index
  }
  async #turnPage(dir, distance, animated, blockUserInput = false) {
    // A page turn received after resize has claimed the viewport must not wait
    // for reflow and execute against the newly paginated layout. Rejecting it
    // also lets the native reader discard its pre-resize expected-page state.
    if (this.#locked || this.#viewport.reflowActive) return "rejected"
    // An overlay cannot take ownership of a touch sequence that already
    // started in the book document. Reject the Swift command and let that
    // gesture's PageFlipped event be the sole source of navigation instead.
    if (blockUserInput && this.#pageTurnSelection.touchActive) return "rejected"
    this.#locked = true
    if (blockUserInput) this.#committedPageTurnInput.setRequested(true)
    try {
      await this.#viewport.wait()
      const selection = this.#view?.document?.getSelection()
      const hasSelection = Boolean(
        selection?.rangeCount && !selection.isCollapsed,
      )
      const turnAnimated = animated && !hasSelection
      if (turnAnimated) this.#pageTurnSelection.suppress()

      const prev = dir === -1
      const { status, shouldGo } = await (prev
        ? this.#scrollPrev(distance, turnAnimated)
        : this.#scrollNext(distance, turnAnimated))
      if (status !== "completed") return status
      if (shouldGo)
        await this.#goTo({
          index: this.#adjacentIndex(dir),
          anchor: prev ? () => 1 : () => 0,
        })
      if (shouldGo || !this.#shouldAnimateScrolling()) await wait(100)
      return "completed"
    } finally {
      if (blockUserInput) this.#committedPageTurnInput.setRequested(false)
      this.#locked = false
      this.#pageTurnSelection.releaseIfSettled()
    }
  }
  prev(distance, animated = true, blockUserInput = false) {
    return this.#turnPage(-1, distance, animated, blockUserInput)
  }
  next(distance, animated = true, blockUserInput = false) {
    return this.#turnPage(1, distance, animated, blockUserInput)
  }
  prevSection() {
    return this.goTo({ index: this.#adjacentIndex(-1) })
  }
  nextSection() {
    return this.goTo({ index: this.#adjacentIndex(1) })
  }
  firstSection() {
    const index = this.sections.findIndex((section) => section.linear !== "no")
    return this.goTo({ index })
  }
  lastSection() {
    const index = this.sections.findLastIndex(
      (section) => section.linear !== "no",
    )
    return this.goTo({ index })
  }
  getContents() {
    if (this.#view)
      return [
        {
          index: this.#index,
          overlayer: this.#view.overlayer,
          doc: this.#view.document,
        },
      ]
    return []
  }
  setStyles(styles) {
    this.#styles = styles
    const $$styles = this.#styleMap.get(this.#view?.document)
    if (!$$styles) return
    const [$beforeStyle, $style] = $$styles
    if (Array.isArray(styles)) {
      const [beforeStyle, style] = styles
      $beforeStyle.textContent = beforeStyle
      $style.textContent = style
    } else $style.textContent = styles

    // NOTE: needs `requestAnimationFrame` in Chromium
    requestAnimationFrame(
      () =>
        (this.#background.style.background = getBackground(
          this.#view.document,
        )),
    )

    // needed because the resize observer doesn't work in Firefox
    this.#view?.document?.fonts?.ready?.then(() => this.#view.expand())
  }
  focusView() {
    this.#view.document.defaultView.focus()
  }
  destroy() {
    if (this.#scrolledFlowRestoreFrame !== null)
      cancelAnimationFrame(this.#scrolledFlowRestoreFrame)
    this.#viewport.reset()
    this.#observer.unobserve(this)
    this.#view.destroy()
    this.#view = null
    this.sections[this.#index]?.unload?.()
    this.#mediaQuery.removeEventListener("change", this.#mediaQueryListener)
  }
}

customElements.define("foliate-paginator", Paginator)
