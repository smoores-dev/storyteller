import { debugLog } from "./DebugConfig.js"

const ICON = {
  more: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>',
  dictionary:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><text x="12" y="13.5" font-size="9" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none" font-family="Georgia,\'Times New Roman\',serif">A</text></svg>',
  share:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-2"/><polyline points="9 5 12 2 15 5"/><line x1="12" y1="2" x2="12" y2="12"/></svg>',
  translate:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>',
  search:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  trash:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  edit: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
}

const WHEEL_GRADIENT =
  "conic-gradient(#ff2d2d,#ff9500,#ffe000,#34d93a,#00c4d6,#2d6bff,#c44dff,#ff2d2d)"

/**
 * SelectionToolbar - compact floating icon bar anchored to a selection or
 * tapped highlight.
 *
 * Rendered into the top-level (untransformed) document at a `fixed` position;
 * the caller supplies a rect already in top-document viewport coordinates, plus
 * the button actions. This class only builds and places the DOM.
 *
 * Colors are collapsed to a single primary swatch plus a rainbow "wheel" that
 * expands the full palette inline, keeping the bar narrow enough for an iPhone.
 */
export class SelectionToolbar {
  #palette = []
  #translateAvailable = false
  #defaultColorId = null
  #touch = false
  #el = null
  #doc = null
  #lastRect = null

  setPalette(palette) {
    this.#palette = Array.isArray(palette) ? palette : []
  }

  setTranslateAvailable(value) {
    this.#translateAvailable = !!value
  }

  setDefaultColor(colorId) {
    this.#defaultColorId = colorId || null
  }

  get isVisible() {
    return this.#el != null
  }

  hide() {
    if (this.#el && this.#el.parentNode) {
      this.#el.parentNode.removeChild(this.#el)
    }
    this.#el = null
    this.#doc = null
    this.#lastRect = null
  }

  showForSelection(topDoc, rect, actions) {
    const el = this.#begin(topDoc)

    el.appendChild(
      this.#colorControls(
        (id) => actions.highlight(id),
        this.#defaultColorId,
        null,
      ),
    )
    el.appendChild(
      this.#iconButton(ICON.more, "More", () => {
        actions.note()
        this.hide()
      }),
    )
    el.appendChild(this.#divider())
    el.appendChild(
      this.#iconButton(ICON.dictionary, "Define", () => {
        actions.define()
        this.hide()
      }),
    )
    el.appendChild(
      this.#iconButton(ICON.share, "Share", () => {
        actions.share()
        this.hide()
      }),
    )
    if (this.#translateAvailable) {
      el.appendChild(
        this.#iconButton(ICON.translate, "Translate", () => {
          actions.translate()
          this.hide()
        }),
      )
    }
    el.appendChild(
      this.#iconButton(ICON.search, "Search", () => {
        actions.search()
        this.hide()
      }),
    )

    this.#finish(rect)
  }

  showForHighlight(topDoc, rect, currentColor, actions) {
    const el = this.#begin(topDoc)

    el.appendChild(
      this.#colorControls(
        (id) => actions.setColor(id),
        currentColor,
        currentColor,
      ),
    )
    el.appendChild(this.#divider())
    el.appendChild(
      this.#iconButton(ICON.trash, "Delete", () => {
        actions.delete()
        this.hide()
      }),
    )
    el.appendChild(
      this.#iconButton(ICON.edit, "Edit", () => {
        actions.edit()
        this.hide()
      }),
    )

    this.#finish(rect)
  }

  #begin(topDoc) {
    this.hide()
    this.#doc = topDoc
    this.#touch =
      !!topDoc.defaultView?.matchMedia?.("(pointer: coarse)").matches

    const el = topDoc.createElement("div")
    el.className = "storyteller-selection-toolbar"
    el.style.cssText = [
      "position:fixed",
      "z-index:2147483647",
      "display:flex",
      "align-items:center",
      `gap:${this.#touch ? 6 : 2}px`,
      `padding:${this.#touch ? "6px 10px" : "4px 7px"}`,
      "border-radius:11px",
      "background:rgba(38,38,40,0.98)",
      "box-shadow:0 2px 14px rgba(0,0,0,0.4)",
      "user-select:none",
      "-webkit-user-select:none",
      "opacity:0",
      "transition:opacity 0.1s ease",
    ].join(";")

    // Keep the selection alive (mousedown would otherwise collapse it) and stop
    // taps from reaching the reader's page-turn / overlay-toggle click handler.
    const swallow = (e) => {
      e.preventDefault()
      e.stopPropagation()
    }
    el.addEventListener("mousedown", swallow, true)
    el.addEventListener("pointerdown", swallow, true)
    el.addEventListener("touchstart", (e) => e.stopPropagation(), {
      passive: true,
    })
    el.addEventListener("click", (e) => e.stopPropagation())

    this.#el = el
    return el
  }

  #finish(rect) {
    const doc = this.#doc
    ;(doc.body || doc.documentElement).appendChild(this.#el)
    this.#lastRect = rect
    this.#position(rect)
    debugLog("SelectionToolbar", "shown")
  }

  // leadColorId selects which swatch sits in the collapsed slot; currentColor
  // (when set) draws the selected ring. For a new selection the lead is the
  // last-used color but nothing is "selected" yet, so currentColor is null.
  #colorControls(onPick, leadColorId, currentColor) {
    const group = this.#doc.createElement("div")
    group.style.cssText = `display:flex;align-items:center;gap:${
      this.#touch ? 12 : 7
    }px;padding:0 ${this.#touch ? 6 : 4}px;`
    this.#renderCollapsedColors(group, onPick, leadColorId, currentColor)
    return group
  }

  #renderCollapsedColors(group, onPick, leadColorId, currentColor) {
    group.textContent = ""
    const lead =
      this.#palette.find(
        (e) => e.id === leadColorId || e.color === leadColorId,
      ) || this.#palette[0]
    if (lead) {
      const selected =
        currentColor != null &&
        (lead.id === currentColor || lead.color === currentColor)
      group.appendChild(this.#swatch(lead, selected, () => onPick(lead.id)))
    }
    group.appendChild(
      this.#wheel(() =>
        this.#renderExpandedColors(group, onPick, currentColor),
      ),
    )
  }

  #renderExpandedColors(group, onPick, currentColor) {
    group.textContent = ""
    for (const entry of this.#palette) {
      const selected =
        currentColor != null &&
        (entry.color === currentColor || entry.id === currentColor)
      group.appendChild(this.#swatch(entry, selected, () => onPick(entry.id)))
    }
    // The bar got wider; re-center it against the original anchor.
    if (this.#lastRect) this.#position(this.#lastRect)
  }

  #iconButton(svg, title, onClick) {
    const b = this.#doc.createElement("button")
    b.type = "button"
    b.title = title
    b.innerHTML = svg
    const size = this.#touch ? 40 : 30
    b.style.cssText = [
      "all:unset",
      "cursor:pointer",
      `width:${size}px`,
      `height:${size}px`,
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "border-radius:7px",
      "color:#fff",
    ].join(";")
    b.addEventListener("click", (e) => {
      e.preventDefault()
      e.stopPropagation()
      onClick()
    })
    return b
  }

  #swatch(entry, selected, onClick) {
    const b = this.#doc.createElement("button")
    b.type = "button"
    b.title = entry.label || entry.id
    const d = this.#touch ? 26 : 21
    b.style.cssText = [
      "all:unset",
      "cursor:pointer",
      `width:${d}px`,
      `height:${d}px`,
      "border-radius:50%",
      `background:${entry.color}`,
      selected
        ? "box-shadow:0 0 0 2px #fff"
        : "box-shadow:0 0 0 1px rgba(255,255,255,0.3)",
    ].join(";")
    b.addEventListener("click", (e) => {
      e.preventDefault()
      e.stopPropagation()
      onClick()
    })
    return b
  }

  #wheel(onClick) {
    const b = this.#doc.createElement("button")
    b.type = "button"
    b.title = "More colors"
    const d = this.#touch ? 26 : 21
    b.style.cssText = [
      "all:unset",
      "cursor:pointer",
      `width:${d}px`,
      `height:${d}px`,
      "border-radius:50%",
      `background:${WHEEL_GRADIENT}`,
      "box-shadow:0 0 0 1px rgba(255,255,255,0.3)",
    ].join(";")
    b.addEventListener("click", (e) => {
      e.preventDefault()
      e.stopPropagation()
      onClick()
    })
    return b
  }

  #divider() {
    const d = this.#doc.createElement("div")
    d.style.cssText = `width:1px;height:${
      this.#touch ? 28 : 22
    }px;background:rgba(255,255,255,0.18);margin:0 ${
      this.#touch ? 6 : 4
    }px;flex:none;`
    return d
  }

  #position(rect) {
    const el = this.#el
    const view = this.#doc?.defaultView
    if (!el || !view) return

    const vw = view.innerWidth
    const vh = view.innerHeight
    const w = el.offsetWidth
    const h = el.offsetHeight

    let left = rect.left + rect.width / 2 - w / 2
    left = Math.max(8, Math.min(left, vw - w - 8))

    let top = rect.top - h - 10
    if (top < 8) top = rect.bottom + 10
    top = Math.max(8, Math.min(top, vh - h - 8))

    el.style.left = `${Math.round(left)}px`
    el.style.top = `${Math.round(top)}px`
    view.requestAnimationFrame(() => {
      el.style.opacity = "1"
    })
  }
}

export default SelectionToolbar
