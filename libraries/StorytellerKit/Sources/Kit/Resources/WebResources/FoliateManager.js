import "./foliate-js/view.js"
import { Overlayer } from "./foliate-js/overlayer.js"
import { SpanHighlighter } from "./SpanHighlighter.js"
import { debugLog } from "./DebugConfig.js"
import BookmarkManager from "./BookmarkManager.js"

const getReadaloudCSS = ({
  activeClass,
  dimOthers,
  dimAmount,
  highlightMode,
  textItalic,
  textBold,
  foregroundColor,
  backgroundColor,
}) => {
  const rules = []
  const root = "html.storyteller-readaloud-active"
  const block = ":is(p, li, blockquote, dd, h1, h2, h3, h4, h5, h6)"
  if (dimOthers && foregroundColor) {
    const keep = Math.max(0.05, 1 - dimAmount)
    const spokenWords = `${root} .${activeClass}`
    const dimmedColor = `color-mix(in srgb, ${foregroundColor} ${(keep * 100).toFixed(0)}%, ${backgroundColor || "transparent"})`
    // Only the active rule carries the transition, so a sentence losing the
    // class dims on the same frame its highlight is pulled rather than sitting
    // at full brightness behind nothing.
    rules.push(`
    ${root} ${block}:not(.${activeClass}),
    ${root} ${block} *:not(.${activeClass}):not(.${activeClass} *) {
        color: ${dimmedColor} !important;
    }
    ${spokenWords},
    ${spokenWords} * {
        color: ${foregroundColor} !important;
        transition: color 0.25s ease;
    }`)
  }
  if (highlightMode === "text" && (textItalic || textBold)) {
    rules.push(`
    .${activeClass},
    .${activeClass} * {
        ${textItalic ? "font-style: italic !important;" : ""}
        ${textBold ? "font-weight: bold !important;" : ""}
    }`)
  }
  return rules.join("")
}

const getCSS = ({
  lineSpacing = 1.4,
  textAlign = "justify",
  hyphenate,
  mediaActiveClass,
  fontSize = 16,
  fontFamily = null,
  marginLeftRight = 8,
  wordSpacing = 0,
  letterSpacing = 0,
  paragraphSpacing = 0,
  firstLineIndent = false,
  highlightColor = "#333333",
  highlightThickness = 1.0,
  backgroundColor = null,
  foregroundColor = null,
  customCSS = null,
  readaloudDimOthers = false,
  readaloudDimAmount = 0.5,
  readaloudHighlightMode = "background",
  readaloudTextItalic = false,
  readaloudTextBold = false,
}) => {
  const activeClass = mediaActiveClass || "epub-media-overlay-active"
  const resolvedFontFamily =
    fontFamily === "System Default" ? "serif" : fontFamily
  const genericFamilies = ["serif", "sans-serif", "monospace"]
  const fontFamilyCSS = resolvedFontFamily
    ? genericFamilies.includes(resolvedFontFamily)
      ? `font-family: ${resolvedFontFamily} !important;`
      : `font-family: "${resolvedFontFamily}", serif !important;`
    : ""
  const marginLR = `${marginLeftRight}%`

  const backgroundColorCSS = backgroundColor
    ? `background-color: ${backgroundColor} !important;`
    : "background-color: transparent !important;"
  const foregroundColorCSS = foregroundColor
    ? `color: ${foregroundColor} !important;`
    : ""
  const paragraphSpacingCSS =
    paragraphSpacing > 0
      ? `p { margin-top: 0 !important; margin-bottom: ${paragraphSpacing}em !important; }`
      : ""
  const firstLineIndentCSS = firstLineIndent
    ? "p { text-indent: 1.4em !important; }"
    : ""

  return `
    @namespace epub "http://www.idpf.org/2007/ops";
    html {
        color-scheme: light dark;
        ${backgroundColor ? backgroundColorCSS : ""}
    }
    @media (prefers-color-scheme: dark) {
        a:link {
            color: lightblue;
        }
    }
    body {
        padding-left: ${marginLR} !important;
        padding-right: ${marginLR} !important;
        ${backgroundColorCSS}
        ${foregroundColorCSS}
    }
    p, li, blockquote, dd {
        font-size: ${fontSize}px !important;
        ${fontFamilyCSS}
        line-height: ${lineSpacing} !important;
        text-align: ${textAlign};
        -webkit-hyphens: ${hyphenate ? "auto" : "manual"};
        hyphens: ${hyphenate ? "auto" : "manual"};
        -webkit-hyphenate-limit-before: 3;
        -webkit-hyphenate-limit-after: 2;
        -webkit-hyphenate-limit-lines: 2;
        hanging-punctuation: allow-end last;
        widows: 1 !important;
        orphans: 1 !important;
        word-spacing: ${wordSpacing}em !important;
        letter-spacing: ${letterSpacing}em !important;
        ${foregroundColorCSS}
    }
    div {
        font-size: ${fontSize}px !important;
        ${fontFamilyCSS}
        line-height: ${lineSpacing} !important;
        word-spacing: ${wordSpacing}em !important;
        letter-spacing: ${letterSpacing}em !important;
        ${foregroundColorCSS}
    }
    span, font, em, strong, i, b {
        font-size: inherit !important;
        line-height: ${lineSpacing} !important;
        ${fontFamilyCSS}
        word-spacing: ${wordSpacing}em !important;
        letter-spacing: ${letterSpacing}em !important;
        ${foregroundColorCSS}
    }
    h1, h2, h3, h4, h5, h6 {
        ${fontFamilyCSS}
        word-spacing: ${wordSpacing}em !important;
        letter-spacing: ${letterSpacing}em !important;
        ${foregroundColorCSS}
    }
    .storyteller-align { text-align: ${textAlign} !important; }
    [align="left"] { text-align: left; }
    [align="right"] { text-align: right; }
    [align="center"] { text-align: center; }
    [align="justify"] { text-align: justify; }
    pre {
        white-space: pre-wrap !important;
    }
    aside[epub|type~="endnote"],
    aside[epub|type~="footnote"],
    aside[epub|type~="note"],
    aside[epub|type~="rearnote"] {
        display: none;
    }
    .${activeClass},
    .${activeClass} * {
        background-color: transparent !important;
        color: inherit !important;
    }
    ${getReadaloudCSS({
      activeClass,
      dimOthers: readaloudDimOthers,
      dimAmount: readaloudDimAmount,
      highlightMode: readaloudHighlightMode,
      textItalic: readaloudTextItalic,
      textBold: readaloudTextBold,
      foregroundColor,
      backgroundColor,
    })}
    /* Highlight z-index layering: text floats above SVG overlay */
    p, span, em, strong, i, b, a, div, li, h1, h2, h3, h4, h5, h6, blockquote, dd, dt, pre, code, td, th, caption, label, figcaption {
        position: relative !important;
        z-index: 1 !important;
    }
    ${paragraphSpacingCSS}
    ${firstLineIndentCSS}
    ${customCSS || ""}
`
}

/**
 * FoliateManager - Thin wrapper around foliate-view
 *
 * Design principles:
 * - NO business logic or decision-making (Swift's job)
 * - Minimal state (view reference + current styles)
 * - Query foliate state when Swift asks
 * - Execute commands from Swift
 * - Report events to Swift
 */
class FoliateManager {
  #view
  #fontSize = 20
  #fontFamily = "System Default"
  #lineSpacing = 1.4
  #isDarkMode = false
  #marginLeftRight = 0
  #marginTop = 6
  #marginBottom = 4
  #wordSpacing = 0
  #letterSpacing = 0
  #paragraphSpacing = 0
  #firstLineIndent = false
  #textAlign = "justify"
  #highlightColor = "#333333"
  #highlightThickness = 1.0
  #backgroundColor = null
  #foregroundColor = null
  #customCSS = null
  #readaloudOverlayers = new Map()
  #readaloudHighlightMode = "background"
  #readaloudDimOthers = false
  #readaloudDimAmount = 0.5
  #readaloudHighlightFade = 0
  #readaloudTextItalic = false
  #readaloudTextBold = false
  #readaloudUnderlineStyle = "solid"
  #playbackActive = false
  #lastDoubleClickAt = 0
  #readaloudSpanHighlighter = new SpanHighlighter()
  #lastSpanHighlightedElement = null
  #lastSpanHighlightedColor = null
  #singleColumnMode = false
  #scrollingMode = false
  #hasAudioNarration = false
  #enableMarginClickNavigation = true
  #lastRelocateRange = null
  #highlightedElement = null
  #highlightedSectionIndex = null
  #resizeHandler = null
  #pendingHighlight = null
  #bookmarkManager = (() => {
    console.log("[FoliateManager] Creating BookmarkManager instance")
    return new BookmarkManager()
  })()

  async open(file) {
    debugLog("FoliateManager", "open() called with file:", file.name)

    this.#view = document.createElement("foliate-view")
    this.#view.setAttribute("flow", "paginated")

    const container = document.getElementById("reader-container")
    container.appendChild(this.#view)

    debugLog("FoliateManager", "Setting up event listeners")
    this.#attachEventListeners()

    debugLog("FoliateManager", "Opening file in foliate-view...")
    await this.#view.open(file)

    this.#bookmarkManager.setView(this.#view)

    debugLog("FoliateManager", "Book opened, reporting structure to Swift")
    await this.#reportBookStructureReady()

    debugLog("FoliateManager", "Initialization complete")
  }

  #attachEventListeners() {
    this.#view.addEventListener("relocate", ({ detail }) => {
      this.#reportRelocate(detail)
    })

    this.#view.addEventListener("page-flip", ({ detail }) => {
      this.#reportPageFlip(detail)
    })

    let clickTimer = null

    this.#view.addEventListener("load", ({ detail }) => {
      const { doc, index } = detail
      if (doc) {
        let isDragging = false

        doc.addEventListener(
          "touchmove",
          (event) => {
            const selection = doc.getSelection?.()
            if (selection && !selection.isCollapsed) {
              event.stopPropagation()
            }
          },
          { capture: true },
        )

        doc.addEventListener(
          "keydown",
          (event) => {
            this.#handleKeyDown(event)
          },
          { capture: true },
        )

        doc.addEventListener("mousedown", () => {
          isDragging = false
        })

        doc.addEventListener("mousemove", (e) => {
          if (e.buttons === 1) {
            isDragging = true
          }
        })

        doc.addEventListener("click", (event) => {
          if (clickTimer !== null) {
            clearTimeout(clickTimer)
            clickTimer = null
            this.#handleDoubleClick(event, index, doc)
            return
          }

          if (isDragging) {
            isDragging = false
            return
          }

          const selection = doc.getSelection?.()
          if (selection && !selection.isCollapsed) {
            return
          }

          clickTimer = setTimeout(() => {
            clickTimer = null
            const selectionNow = doc.getSelection?.()
            if (selectionNow && !selectionNow.isCollapsed) {
              return
            }
            this.#handleSingleClick(event)
          }, 150)
        })

        doc.addEventListener("dblclick", (event) => {
          if (clickTimer) {
            clearTimeout(clickTimer)
            clickTimer = null
          }

          this.#handleDoubleClick(event, index, doc)
        })

        this.#markAlignableText(doc)
        this.#bookmarkManager.setupSection(index, doc)
      }
    })

    debugLog("FoliateManager", "Event listeners attached")
  }

  // Books set text-align on their own classes, which outranks a bare element
  // selector, so the alignment setting alone can never win. Tag the elements
  // whose current alignment is not an explicit center/right, and let the
  // tagged rule carry !important; anything the book deliberately centers
  // (chapter heads, scene breaks) keeps its alignment.
  #markAlignableText(doc) {
    const win = doc.defaultView
    if (!win) return

    for (const el of doc.querySelectorAll("p, li, blockquote, dd")) {
      const align = win.getComputedStyle(el).textAlign
      if (align === "center" || align === "right" || align === "end") continue
      el.classList.add("storyteller-align")
    }
  }

  #handleKeyDown(event) {
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    )
      return

    const target = event.target
    const tagName = target?.tagName?.toLowerCase?.()
    if (
      target?.isContentEditable ||
      tagName === "input" ||
      tagName === "textarea" ||
      tagName === "select"
    ) {
      return
    }

    // iPad hardware keyboard: route left/right arrows through the same EPM path as
    // macOS arrow keys (Swift handleUserNavLeft/Right). WKWebView swallows hardware
    // keys on iOS so SwiftUI's onKeyPress (used on macOS) never fires over the
    // webview; this keydown listener is the only reliable capture point, and
    // MarginClickNav is the existing bridge into the EPM. Gated to touch devices
    // (maxTouchPoints is 0 on the AppKit macOS build) so macOS keeps using its
    // native onKeyPress and we never double-navigate. Raw direction is sent so it
    // matches macOS arrow keys exactly, bypassing the RTL flip that tap zones use.
    if (
      navigator.maxTouchPoints > 0 &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight")
    ) {
      event.preventDefault()
      event.stopPropagation()
      window.webkit?.messageHandlers?.MarginClickNav?.postMessage({
        direction: event.key === "ArrowLeft" ? "left" : "right",
      })
      return
    }

    // iPad: up/down skip a sentence for readalouds, matching macOS arrow keys
    // (Swift handlePrevSentence/handleNextSentence via SentenceSkip). Gated to
    // audio narration only, and works in both paginated and scrolling modes -
    // unlike the macOS-only block below, which is restricted to scrolling mode
    // because that is the only case where macOS needs JS to intercept up/down
    // before the page scrolls. Touch-gated so macOS keeps its native onKeyPress.
    if (
      navigator.maxTouchPoints > 0 &&
      this.#hasAudioNarration &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      event.preventDefault()
      event.stopPropagation()
      window.webkit?.messageHandlers?.SentenceSkip?.postMessage({
        direction: event.key === "ArrowUp" ? "previous" : "next",
      })
      return
    }

    if (!this.#scrollingMode || !this.#hasAudioNarration) return
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return

    event.preventDefault()
    event.stopPropagation()

    window.webkit?.messageHandlers?.SentenceSkip?.postMessage({
      direction: event.key === "ArrowUp" ? "previous" : "next",
    })
  }

  #reportRelocate(detail) {
    debugLog("trace", "[FM2] Relocate event")

    if (!detail || !detail.cfi) {
      console.warn("[FM2] Relocate event missing detail or CFI")
      return
    }

    this.#bookmarkManager.redrawAllOverlayers()

    this.#lastRelocateRange = detail.range || null
    debugLog(
      "trace",
      "[FM2] Stored relocate range:",
      this.#lastRelocateRange ? "available" : "null",
    )

    const sectionIndex = detail.section?.current
    const isScrolled = this.#view?.renderer?.scrolled === true
    const rawPage = isScrolled ? null : this.#view?.renderer?.page
    const rawPages = isScrolled ? null : this.#view?.renderer?.pages

    const textPages =
      typeof rawPages === "number" && Number.isFinite(rawPages) && rawPages > 0
        ? Math.max(1, Math.round(rawPages - 2))
        : null

    const pageIndex =
      typeof rawPage === "number" &&
      Number.isFinite(rawPage) &&
      textPages != null
        ? Math.max(0, Math.min(textPages - 1, Math.round(rawPage - 1))) + 1
        : null

    const totalPages = textPages

    // Let the toolbar dismiss itself only on a genuine page/section move; the
    // "anchor" / "snap" relocate stream that fires while selecting must not.
    this.#bookmarkManager.handleRelocate(`${sectionIndex}:${pageIndex}`)

    const href =
      sectionIndex != null
        ? this.#view?.book?.sections?.[sectionIndex]?.id || null
        : null

    debugLog(
      "overlay",
      "[FM2] Relocate - section:",
      sectionIndex,
      "page:",
      pageIndex,
      "/",
      totalPages,
      "href:",
      href,
    )

    let bookFraction = detail.fraction
    if (
      !Number.isFinite(bookFraction) &&
      detail.section?.current != null &&
      detail.section?.total > 0
    ) {
      bookFraction = detail.section.current / detail.section.total
    }

    let chapterFraction = null
    const sectionFractions = this.#view?.getSectionFractions?.() || []
    if (Number.isFinite(detail.fraction) && sectionIndex != null) {
      const sectionStart = sectionFractions[sectionIndex] || 0
      const sectionEnd = sectionFractions[sectionIndex + 1] || 1
      const sectionSize = sectionEnd - sectionStart
      chapterFraction =
        sectionSize > 0 ? (detail.fraction - sectionStart) / sectionSize : 0
    }

    const payload = {
      sectionIndex: sectionIndex,
      pageIndex: pageIndex,
      totalPages: totalPages,
      href: href,
      cfi: detail.cfi,
      fraction: bookFraction,
      chapterFraction: chapterFraction,
      title: detail.tocItem?.label || null,
      flow: isScrolled ? "scrolled" : "paginated",
      reason: detail.reason || null,
    }

    window.webkit?.messageHandlers?.Relocated?.postMessage(payload)

    if (this.#pendingHighlight) {
      const { sectionIndex: pendingSectionIndex, textId } =
        this.#pendingHighlight
      debugLog(
        "FoliateManager",
        `Checking pending highlight: section=${pendingSectionIndex}, textId=${textId}`,
      )
      setTimeout(() => {
        this.highlightFragment(pendingSectionIndex, textId)
      }, 50)
    }
  }

  #reportBookStructureReady() {
    const bookSections = this.#view?.book?.sections || []

    const sections = bookSections.map((section, index) => {
      return {
        index: index,
        id: section.id,
        label: null,
        level: null,
        mediaOverlay: [],
      }
    })

    debugLog(
      "FoliateManager",
      "Book structure ready -",
      sections.length,
      "sections",
    )

    const payload = { sections }
    window.webkit?.messageHandlers?.BookStructureReady?.postMessage(payload)
  }

  #reportOverlayToggle() {
    window.webkit?.messageHandlers?.OverlayToggled?.postMessage({})
  }

  #handleSingleClick(event) {
    if (!this.#enableMarginClickNavigation) {
      this.#reportOverlayToggle()
      return
    }

    const pageWidth = this.#singleColumnMode
      ? window.innerWidth
      : Math.floor(window.innerWidth / 2)

    const marginZonePercent = 0.15
    const leftZone = pageWidth * marginZonePercent
    const rightZone = pageWidth * (1 - marginZonePercent)
    const clickX = event.clientX % pageWidth

    if (clickX < leftZone) {
      this.#handleMarginClickNavigation("left")
    } else if (clickX > rightZone) {
      this.#handleMarginClickNavigation("right")
    } else {
      this.#reportOverlayToggle()
    }
  }

  #handleMarginClickNavigation(direction) {
    if (!this.#view) {
      console.warn("[FM2] Margin click navigation but view not initialized")
      return
    }

    const isRtl = this.#view?.book?.dir === "rtl"
    const effectiveDirection = isRtl
      ? direction === "left"
        ? "right"
        : "left"
      : direction

    // Don't navigate here - let Swift handle it through EPM like arrow keys
    window.webkit?.messageHandlers?.MarginClickNav?.postMessage({
      direction: effectiveDirection,
    })
  }

  #reportPageFlip(detail) {
    if (!detail) {
      console.warn("[FM2] Page flip event missing detail")
      return
    }

    const fromPage = Number.isFinite(detail.fromPage) ? detail.fromPage : null
    const toPage = Number.isFinite(detail.toPage) ? detail.toPage : null

    if (fromPage == null || toPage == null || fromPage === toPage) {
      debugLog(
        "FoliateManager",
        "Ignoring page flip with invalid page numbers",
        detail,
      )
      return
    }

    const delta = toPage - fromPage
    const isRtl = this.#view?.book?.dir === "rtl"
    let direction = delta > 0 ? "right" : "left"
    if (isRtl) {
      direction = direction === "right" ? "left" : "right"
    }

    debugLog(
      "FoliateManager",
      "Posting PageFlipped message to Swift",
      direction,
    )

    window.webkit?.messageHandlers?.PageFlipped?.postMessage({
      direction: direction,
      fromPage: fromPage,
      toPage: toPage,
      delta: delta,
      isRtl: !!isRtl,
    })
  }

  goLeft() {
    debugLog("FoliateManager", "goLeft()")
    if (!this.#view) {
      console.warn("[FM2] goLeft() called but view not initialized")
      return
    }
    this.#view.goLeft()
  }

  goRight() {
    debugLog("FoliateManager", "goRight()")
    if (!this.#view) {
      console.warn("[FM2] goRight() called but view not initialized")
      return
    }
    this.#view.goRight()
  }

  goTo(href) {
    debugLog("FoliateManager", "goTo() - href:", href)
    if (!this.#view) {
      console.warn("[FM2] goTo() called but view not initialized")
      return
    }
    this.#view.goTo(href)
  }

  async goToFractionInSection(sectionIndex, fraction) {
    debugLog(
      "FoliateManager",
      `goToFractionInSection(${sectionIndex}, ${fraction})`,
    )
    if (!this.#view) {
      console.warn(
        "[FM2] goToFractionInSection() called but view not initialized",
      )
      return
    }
    if (typeof sectionIndex !== "number" || typeof fraction !== "number") {
      console.warn("[FM2] goToFractionInSection() - invalid parameters")
      return
    }
    await this.#view.goToFractionInSection(sectionIndex, fraction)
  }

  async goToBookFraction(bookFraction) {
    debugLog("FoliateManager", `goToBookFraction(${bookFraction})`)
    if (!this.#view) {
      console.warn("[FM2] goToBookFraction() called but view not initialized")
      return
    }

    const sectionFractions = this.#view?.getSectionFractions?.() || []

    if (bookFraction <= 0) {
      return this.goToFractionInSection(0, 0)
    }
    if (bookFraction >= 1) {
      const lastIdx = Math.max(0, sectionFractions.length - 2)
      return this.goToFractionInSection(lastIdx, 1)
    }

    let sectionIndex = sectionFractions.findIndex((x) => x > bookFraction) - 1
    if (sectionIndex < 0) sectionIndex = 0

    const sectionStart = sectionFractions[sectionIndex] || 0
    const sectionEnd = sectionFractions[sectionIndex + 1] || 1
    const sectionSize = sectionEnd - sectionStart
    const fractionInSection =
      sectionSize > 0 ? (bookFraction - sectionStart) / sectionSize : 0

    return this.goToFractionInSection(sectionIndex, fractionInSection)
  }

  getCurrentLocation() {
    if (!this.#view) {
      console.warn("[FM2] getCurrentLocation() called but view not initialized")
      return null
    }

    const pageIndex = this.#view.renderer?.page
    const fraction = this.#view.renderer?.getOverallProgress?.()

    debugLog(
      "FoliateManager",
      "getCurrentLocation() - page:",
      pageIndex,
      "fraction:",
      fraction,
    )

    return {
      pageIndex: pageIndex,
      fraction: fraction,
    }
  }

  updateStyles(jsonString) {
    // Don't log full jsonString - customCSS contains huge base64 font data
    try {
      const parsed = JSON.parse(jsonString)
      const { customCSS, ...rest } = parsed
      debugLog(
        "FoliateManager",
        "updateStyles()",
        rest,
        customCSS ? `[customCSS: ${customCSS.length} chars]` : "",
      )
    } catch {
      debugLog("FoliateManager", "updateStyles() - parse failed")
    }

    if (!this.#view) {
      console.warn("[FM2] updateStyles() called but view not initialized")
      return
    }

    let styles
    try {
      styles = JSON.parse(jsonString)
    } catch (error) {
      console.error("[FM2] Failed to parse styles JSON:", error)
      return
    }

    if (styles.fontSize !== undefined && styles.fontSize !== null) {
      this.#fontSize = styles.fontSize
    }
    if (styles.fontFamily !== undefined && styles.fontFamily !== null) {
      this.#fontFamily = styles.fontFamily
    }
    if (styles.lineSpacing !== undefined && styles.lineSpacing !== null) {
      this.#lineSpacing = styles.lineSpacing
    }
    if (styles.isDarkMode !== undefined && styles.isDarkMode !== null) {
      this.#isDarkMode = styles.isDarkMode
    }
    if (
      styles.marginLeftRight !== undefined &&
      styles.marginLeftRight !== null
    ) {
      this.#marginLeftRight = styles.marginLeftRight
    }
    if (
      styles.marginTopBottom !== undefined &&
      styles.marginTopBottom !== null
    ) {
      this.#marginTop = styles.marginTopBottom
      this.#marginBottom = styles.marginTopBottom
    }
    if (styles.marginTop !== undefined && styles.marginTop !== null) {
      this.#marginTop = styles.marginTop
    }
    if (styles.marginBottom !== undefined && styles.marginBottom !== null) {
      this.#marginBottom = styles.marginBottom
    }
    if (styles.wordSpacing !== undefined && styles.wordSpacing !== null) {
      this.#wordSpacing = styles.wordSpacing
    }
    if (styles.letterSpacing !== undefined && styles.letterSpacing !== null) {
      this.#letterSpacing = styles.letterSpacing
    }
    if (
      styles.paragraphSpacing !== undefined &&
      styles.paragraphSpacing !== null
    ) {
      this.#paragraphSpacing = styles.paragraphSpacing
    }
    if (
      styles.firstLineIndent !== undefined &&
      styles.firstLineIndent !== null
    ) {
      this.#firstLineIndent = styles.firstLineIndent
    }
    if (styles.textAlign !== undefined && styles.textAlign !== null) {
      this.#textAlign = styles.textAlign
    }
    if (styles.highlightColor !== undefined && styles.highlightColor !== null) {
      this.#highlightColor = styles.highlightColor
      this.#refreshReadaloudHighlight()
    }
    if (
      styles.highlightThickness !== undefined &&
      styles.highlightThickness !== null
    ) {
      this.#highlightThickness = styles.highlightThickness
      this.#bookmarkManager.setHighlightThickness(styles.highlightThickness)
    }
    if (
      styles.readaloudHighlightMode !== undefined &&
      styles.readaloudHighlightMode !== null
    ) {
      this.#readaloudHighlightMode = styles.readaloudHighlightMode
      this.#refreshReadaloudHighlight()
    }
    if (styles.readaloudDimOthers != null) {
      this.#readaloudDimOthers = styles.readaloudDimOthers
    }
    if (styles.readaloudDimAmount != null) {
      this.#readaloudDimAmount = styles.readaloudDimAmount
    }
    if (styles.readaloudHighlightFade != null) {
      this.#readaloudHighlightFade = styles.readaloudHighlightFade
    }
    if (styles.readaloudTextItalic != null) {
      this.#readaloudTextItalic = styles.readaloudTextItalic
    }
    if (styles.readaloudTextBold != null) {
      this.#readaloudTextBold = styles.readaloudTextBold
    }
    if (styles.readaloudUnderlineStyle != null) {
      this.#readaloudUnderlineStyle = styles.readaloudUnderlineStyle
    }
    if ("backgroundColor" in styles) {
      this.#backgroundColor = styles.backgroundColor
    }
    if ("foregroundColor" in styles) {
      this.#foregroundColor = styles.foregroundColor
    }
    if ("customCSS" in styles) {
      this.#customCSS = styles.customCSS
    }
    if (
      styles.singleColumnMode !== undefined &&
      styles.singleColumnMode !== null
    ) {
      this.#singleColumnMode = styles.singleColumnMode
    }
    if (styles.scrollingMode !== undefined && styles.scrollingMode !== null) {
      this.#scrollingMode = styles.scrollingMode
    }
    if (
      styles.hasAudioNarration !== undefined &&
      styles.hasAudioNarration !== null
    ) {
      this.#hasAudioNarration = styles.hasAudioNarration
    }
    if (
      styles.enableMarginClickNavigation !== undefined &&
      styles.enableMarginClickNavigation !== null
    ) {
      this.#enableMarginClickNavigation = styles.enableMarginClickNavigation
    }
    if (
      styles.userHighlightMode !== undefined &&
      styles.userHighlightMode !== null
    ) {
      this.#bookmarkManager.setHighlightMode(styles.userHighlightMode)
    }

    this.#applyStylesToRenderer()
    this.#refreshReadaloudHighlight()
  }

  #applyStylesToRenderer() {
    if (!this.#view.renderer) {
      console.warn("[FM2] No renderer found, cannot apply styles")
      return
    }

    const mediaActiveClass =
      this.#view?.book?.media?.activeClass || "epub-media-overlay-active"

    debugLog("FoliateManager", "Applying styles to renderer:", {
      fontSize: this.#fontSize,
      fontFamily: this.#fontFamily,
      backgroundColor: this.#backgroundColor,
      foregroundColor: this.#foregroundColor,
    })

    this.#view.renderer.setStyles?.(
      getCSS({
        lineSpacing: this.#lineSpacing,
        textAlign: this.#textAlign,
        hyphenate: true,
        mediaActiveClass,
        fontSize: this.#fontSize,
        fontFamily: this.#fontFamily,
        marginLeftRight: this.#marginLeftRight,
        wordSpacing: this.#wordSpacing,
        letterSpacing: this.#letterSpacing,
        paragraphSpacing: this.#paragraphSpacing,
        firstLineIndent: this.#firstLineIndent,
        highlightColor: this.#highlightColor,
        backgroundColor: this.#backgroundColor,
        foregroundColor: this.#foregroundColor,
        customCSS: this.#customCSS,
        readaloudDimOthers: this.#readaloudDimOthers,
        readaloudDimAmount: this.#readaloudDimAmount,
        readaloudHighlightMode: this.#readaloudHighlightMode,
        readaloudTextItalic: this.#readaloudTextItalic,
        readaloudTextBold: this.#readaloudTextBold,
      }),
    )

    const flow = this.#scrollingMode ? "scrolled" : "paginated"
    this.#view.renderer.setAttribute("flow", flow)
    debugLog("FoliateManager", `Set flow to ${flow}`)

    const columnCount =
      this.#singleColumnMode || this.#scrollingMode ? "1" : "2"
    this.#view.renderer.setAttribute("max-column-count", columnCount)
    debugLog("FoliateManager", `Set max-column-count to ${columnCount}`)

    const marginTopPx = Math.round((this.#marginTop / 100) * 800)
    const marginBottomPx = Math.round((this.#marginBottom / 100) * 800)
    this.#view.renderer.setAttribute("margin", `${marginTopPx}px`)
    this.#view.renderer.setAttribute("margin-bottom", `${marginBottomPx}px`)
    debugLog(
      "FoliateManager",
      `Set margin to ${marginTopPx}px / ${marginBottomPx}px`,
    )

    this.#view.renderer.setAttribute("gap", "0%")
    this.#updateMaxInlineSize()

    if (!this.#resizeHandler) {
      this.#resizeHandler = () => this.#updateMaxInlineSize()
      window.addEventListener("resize", this.#resizeHandler)
    }

    this.#view.renderer.render?.()
  }

  #updateMaxInlineSize() {
    if (!this.#view?.renderer) return

    if (this.#singleColumnMode || this.#scrollingMode) {
      this.#view.renderer.setAttribute(
        "max-inline-size",
        `${window.innerWidth}px`,
      )
    } else {
      this.#view.renderer.setAttribute(
        "max-inline-size",
        `${Math.floor(window.innerWidth / 2)}px`,
      )
    }
  }

  #extractAnchorFromCFI(cfi) {
    if (!cfi) return null

    const matches = [...cfi.matchAll(/\[([^\]]+)\]/g)]

    for (let i = matches.length - 1; i >= 0; i--) {
      const id = matches[i][1]
      if (!id.match(/^\d+$/) && !id.includes(";") && !id.includes(",")) {
        debugLog("FoliateManager", `Extracted anchor from CFI: ${id}`)
        return id
      }
    }

    return null
  }

  #handleDoubleClick(event, sectionIndex, doc) {
    const now = Date.now()
    if (now - this.#lastDoubleClickAt < 400) return
    this.#lastDoubleClickAt = now

    debugLog(
      "FoliateManager",
      `Double-click detected in section ${sectionIndex}`,
    )

    const selection = doc.getSelection?.()
    let range =
      selection && selection.rangeCount > 0 && !selection.isCollapsed
        ? selection.getRangeAt(0)
        : null
    if (!range && typeof doc.caretRangeFromPoint === "function") {
      range = doc.caretRangeFromPoint(event.clientX, event.clientY)
    }
    if (!range) {
      console.warn("[FM2] No range from double-click")
      return
    }

    let cfi = null
    if (typeof this.#view.getCFI === "function") {
      try {
        cfi = this.#view.getCFI(sectionIndex, range)
        debugLog("FoliateManager", `Got CFI from double-click: ${cfi}`)
      } catch (error) {
        console.warn("[FM2] Failed to get CFI from double-click:", error)
        return
      }
    }

    if (!cfi) {
      console.warn("[FM2] Could not determine CFI from double-click")
      return
    }

    const anchor = this.#extractAnchorFromCFI(cfi)
    if (!anchor) {
      console.warn("[FM2] Could not extract anchor from CFI:", cfi)
      return
    }

    debugLog(
      "FoliateManager",
      `Sending seek event: section=${sectionIndex}, anchor=${anchor}`,
    )
    this.#reportSeekEvent(sectionIndex, anchor)

    selection?.removeAllRanges()
  }

  #reportSeekEvent(sectionIndex, anchor) {
    debugLog(
      "FoliateManager",
      `Reporting seek event to Swift: section=${sectionIndex}, anchor=${anchor}`,
    )

    window.webkit?.messageHandlers?.mediaOverlaySeek?.postMessage({
      sectionIndex: sectionIndex,
      anchor: anchor,
    })
  }

  getFullyVisibleElementIds() {
    const range = this.#lastRelocateRange
    if (!range) {
      console.warn("[FM2] getFullyVisibleElementIds: No range available")
      return []
    }

    const doc =
      range.startContainer?.ownerDocument ||
      range.commonAncestorContainer?.ownerDocument
    if (!doc) {
      console.warn(
        "[FM2] getFullyVisibleElementIds: Could not get document from range",
      )
      return []
    }

    const ids = []
    try {
      const allElements = doc.querySelectorAll("[id]")

      for (const el of allElements) {
        if (!range.intersectsNode(el)) continue

        const nodeRange = doc.createRange()
        try {
          nodeRange.selectNodeContents(el)

          const startsAfterRangeStart =
            range.compareBoundaryPoints(Range.START_TO_START, nodeRange) <= 0
          const endsBeforeRangeEnd =
            range.compareBoundaryPoints(Range.END_TO_END, nodeRange) >= 0

          if (startsAfterRangeStart && endsBeforeRangeEnd) {
            ids.push(el.id)
          }
        } finally {
          nodeRange.detach?.()
        }
      }

      debugLog(
        "FoliateManager",
        `Found ${ids.length} fully visible element IDs`,
      )
    } catch (err) {
      console.warn("[FM2] getFullyVisibleElementIds failed:", err)
    }

    return ids
  }

  getFirstVisiblePosition() {
    const ids = this.getFullyVisibleElementIds()
    if (!ids.length) {
      debugLog("FoliateManager", "getFirstVisiblePosition: No visible elements")
      return null
    }

    const firstId = ids[0]
    const range = this.#lastRelocateRange
    const doc =
      range?.startContainer?.ownerDocument ||
      range?.commonAncestorContainer?.ownerDocument
    if (!doc) return null

    const el = doc.getElementById(firstId)
    if (!el) return null

    const contents = this.#view?.renderer?.getContents?.() || []
    const content = contents.find((c) => c.doc === doc)
    const sectionIndex = content?.index ?? 0
    const href = this.#view?.book?.sections?.[sectionIndex]?.id || ""
    const title =
      this.#view?.book?.toc?.find((t) => t.href?.startsWith(href))?.label ||
      null

    const elRange = doc.createRange()
    elRange.selectNodeContents(el)
    const cfi = this.#view?.getCFI?.(sectionIndex, elRange) || null
    const text = el.textContent?.trim()?.substring(0, 150) || firstId

    debugLog(
      "FoliateManager",
      `getFirstVisiblePosition: id=${firstId}, section=${sectionIndex}`,
    )

    return { sectionIndex, cfi, text, href, title, elementId: firstId }
  }

  // MARK: - Highlight methods (Swift controls audio directly)

  #getReadaloudOverlayer(sectionIndex, doc) {
    const existingOverlayer = this.#readaloudOverlayers.get(sectionIndex)
    if (existingOverlayer && doc.contains(existingOverlayer.element)) {
      return existingOverlayer
    }

    const overlayer = new Overlayer()
    // Attached after body, not inside it: foliate's expand() measures
    // selectNodeContents(body), and a width:100% overlay inside body pins
    // that measurement to the expanded iframe width, growing a phantom
    // page per expand on fractional-dpr devices. Zero-sizing instead is
    // not an option: SVG disables rendering at width or height 0.
    overlayer.element.style.overflow = "visible"
    doc.documentElement.appendChild(overlayer.element)
    this.#readaloudOverlayers.set(sectionIndex, overlayer)
    return overlayer
  }

  // Ranges give one rect per inline fragment; overlapping fragments at
  // slightly different bottoms stack per-fragment squiggles into a mess.
  #mergeLineRects(rects, avgHeight, writingMode) {
    if (writingMode === "vertical-rl" || writingMode === "vertical-lr") {
      return rects
    }
    const tolerance = avgHeight / 2
    const lines = []
    for (const rect of [...rects].sort((a, b) => a.bottom - b.bottom)) {
      const line = lines.find(
        (l) => Math.abs(l.bottom - rect.bottom) < tolerance,
      )
      if (line) {
        line.left = Math.min(line.left, rect.left)
        line.right = Math.max(line.right, rect.right)
        line.top = Math.min(line.top, rect.top)
        line.bottom = Math.max(line.bottom, rect.bottom)
      } else {
        lines.push({
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        })
      }
    }
    return lines.map((l) => ({
      ...l,
      width: l.right - l.left,
      height: l.bottom - l.top,
    }))
  }

  #drawReadaloudHighlight(rects, options = {}) {
    const {
      color,
      thickness = 1,
      underline = false,
      underlineStyle = "solid",
      writingMode,
    } = options
    const scale = Number.isFinite(thickness) && thickness > 0 ? thickness : 1
    const rectList = Array.from(rects).filter(
      (rect) => rect.width > 0 && rect.height > 0,
    )
    if (!rectList.length) {
      return Overlayer.highlight([], { color })
    }

    if (underline) {
      const avgHeight =
        rectList.reduce((sum, rect) => sum + rect.height, 0) / rectList.length
      const lineRects = this.#mergeLineRects(rectList, avgHeight, writingMode)
      if (underlineStyle === "squiggle") {
        const width = Math.max(1, avgHeight * 0.05)
        return Overlayer.squiggly(lineRects, { color, width, writingMode })
      }
      if (underlineStyle === "double") {
        // The lower line hugs the line-box bottom; the box abuts the next
        // line's, so the pair must stack upward into the descender strip.
        const width = Math.max(1, avgHeight * 0.06)
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g")
        const upper = lineRects.map((rect) => ({
          ...rect,
          bottom: rect.bottom - width * 2,
          right: rect.right - width * 2,
        }))
        g.append(
          Overlayer.underline(upper, { color, width, writingMode }),
          Overlayer.underline(lineRects, { color, width, writingMode }),
        )
        return g
      }
      const width = Math.max(1, avgHeight * 0.08)
      return Overlayer.underline(lineRects, { color, width, writingMode })
    }

    const adjustedRects = rectList.map((rect) => {
      const extra = (scale - 1) * rect.height
      return {
        left: rect.left,
        top: rect.top - extra / 2,
        width: rect.width,
        height: Math.max(1, rect.height + extra),
      }
    })

    return Overlayer.highlight(adjustedRects, { color })
  }

  #renderReadaloudHighlight(sectionIndex, el, doc) {
    const range = doc.createRange()
    range.selectNodeContents(el)

    const overlayer = this.#getReadaloudOverlayer(sectionIndex, doc)
    const writingMode = doc.defaultView?.getComputedStyle(doc.body)?.writingMode

    const elementChanged = this.#lastSpanHighlightedElement !== el
    const colorChanged = this.#lastSpanHighlightedColor !== this.#highlightColor
    const isUnderline = this.#readaloudHighlightMode === "underline"

    if (this.#readaloudHighlightMode === "text") {
      overlayer.element.style.opacity = "0"
      overlayer.element.style.zIndex = "0"
      overlayer.add(
        "readaloud",
        range,
        (rects, options) => this.#drawReadaloudHighlight(rects, options),
        {
          color: this.#highlightColor,
          thickness: this.#highlightThickness,
          underline: false,
          writingMode,
        },
      )
      if (elementChanged || colorChanged) {
        this.#readaloudSpanHighlighter.remove("readaloud")
        this.#readaloudSpanHighlighter.add(
          "readaloud",
          range.cloneRange(),
          this.#highlightColor,
        )
        this.#lastSpanHighlightedElement = el
        this.#lastSpanHighlightedColor = this.#highlightColor
      }
    } else {
      if (this.#lastSpanHighlightedElement) {
        this.#readaloudSpanHighlighter.remove("readaloud")
        this.#lastSpanHighlightedElement = null
      }
      overlayer.element.style.opacity = "1"
      overlayer.element.style.zIndex = "0"
      overlayer.element.style.setProperty(
        "--overlayer-highlight-opacity",
        String(Math.max(0, 1 - this.#readaloudHighlightFade)),
      )
      overlayer.element.style.setProperty(
        "--overlayer-highlight-blend-mode",
        "normal",
      )
      overlayer.add(
        "readaloud",
        range,
        (rects, options) => this.#drawReadaloudHighlight(rects, options),
        {
          color: this.#highlightColor,
          thickness: this.#highlightThickness,
          underline: isUnderline,
          underlineStyle: this.#readaloudUnderlineStyle,
          writingMode,
        },
      )
    }
  }

  #clearReadaloudHighlight() {
    for (const overlayer of this.#readaloudOverlayers.values()) {
      overlayer.remove("readaloud")
    }
    this.#readaloudSpanHighlighter.remove("readaloud")
    this.#lastSpanHighlightedElement = null
    this.#highlightedSectionIndex = null
  }

  get #dimActive() {
    return this.#readaloudDimOthers && this.#playbackActive
  }

  setPlaybackActive(active) {
    if (this.#playbackActive === !!active) return
    this.#playbackActive = !!active
    const activeEl = this.#highlightedElement?.deref?.()
    const doc = activeEl?.ownerDocument
    if (doc?.documentElement) {
      doc.documentElement.classList.toggle(
        "storyteller-readaloud-active",
        this.#dimActive,
      )
    }
  }

  #refreshReadaloudHighlight() {
    const activeEl = this.#highlightedElement?.deref?.()
    if (!activeEl || this.#highlightedSectionIndex == null) return
    const doc = activeEl.ownerDocument
    if (!doc) return
    doc.documentElement.classList.toggle(
      "storyteller-readaloud-active",
      this.#dimActive,
    )
    this.#renderReadaloudHighlight(this.#highlightedSectionIndex, activeEl, doc)
  }

  highlightFragment(sectionIndex, textId, seekToLocation = false) {
    debugLog(
      "FoliateManager",
      `highlightFragment(sectionIndex: ${sectionIndex}, textId: ${textId}, seekToLocation: ${seekToLocation})`,
    )

    const prevHighlightEl = this.#highlightedElement?.deref?.()

    if (!this.#view?.book) {
      console.warn("[FM2] highlightFragment() called but book not loaded")
      return
    }

    if (
      sectionIndex < 0 ||
      sectionIndex >= (this.#view.book?.sections?.length ?? 0)
    ) {
      console.warn(
        "[FM2] highlightFragment: Invalid section index:",
        sectionIndex,
      )
      return
    }

    const renderer = this.#view?.renderer
    if (!renderer) {
      console.warn("[FM2] highlightFragment: No renderer available")
      return
    }

    const contents = renderer.getContents?.()
    const sectionHref = this.#view.book?.sections?.[sectionIndex]?.id

    if (!contents || !contents.length) {
      debugLog(
        "FoliateManager",
        "No contents loaded, storing pending highlight and navigating",
      )
      this.#pendingHighlight = { sectionIndex, textId }
      if (sectionHref) this.#view.goTo(`${sectionHref}#${textId}`)
      return
    }

    const content = contents.find((c) => c.index === sectionIndex)
    if (!content?.doc) {
      debugLog(
        "FoliateManager",
        `Section ${sectionIndex} not currently loaded, storing pending highlight and navigating`,
      )
      this.#pendingHighlight = { sectionIndex, textId }
      if (sectionHref) this.#view.goTo(`${sectionHref}#${textId}`)
      return
    }

    const doc = content.doc
    const el = doc.getElementById(textId)
    if (!el) {
      debugLog(
        "FoliateManager",
        `Element ${textId} not found yet in section ${sectionIndex}, storing as pending`,
      )
      this.#pendingHighlight = { sectionIndex, textId }
      if (seekToLocation && sectionHref)
        this.#view.goTo(`${sectionHref}#${textId}`)
      return
    }

    if (seekToLocation && sectionHref) {
      const pageInfo = this.#getElementPageInfo(el, doc, renderer)
      const intersectsCurrentPage =
        !renderer.scrolled && pageInfo?.visibleArea > 0
      if (!intersectsCurrentPage) {
        debugLog(
          "FoliateManager",
          `seekToLocation enabled, navigating to ${sectionHref}#${textId}`,
        )
        this.#pendingHighlight = { sectionIndex, textId }
        this.#view.goTo(`${sectionHref}#${textId}`)
        return
      }
      debugLog(
        "FoliateManager",
        `Element ${textId} already intersects the current page; skipping anchor navigation`,
      )
    }

    this.#pendingHighlight = null

    const activeClass =
      this.#view?.book?.media?.activeClass || "epub-media-overlay-active"
    el.classList.add(activeClass)
    if (prevHighlightEl && prevHighlightEl !== el) {
      prevHighlightEl.classList.remove(activeClass)
    }
    this.#highlightedElement = new WeakRef(el)
    this.#highlightedSectionIndex = sectionIndex
    this.#renderReadaloudHighlight(sectionIndex, el, doc)

    const playbackActiveClass = this.#view?.book?.media?.playbackActiveClass
    if (playbackActiveClass) {
      doc.documentElement.classList.add(playbackActiveClass)
    }
    doc.documentElement.classList.toggle(
      "storyteller-readaloud-active",
      this.#dimActive,
    )

    const splitInfo = this.#getElementSplitInfo(el, doc, renderer)
    const visibleRatio = splitInfo?.visibleRatio ?? 1.0
    const offScreenRatio = splitInfo?.offScreenRatio ?? 0.0

    debugLog(
      "FoliateManager",
      `Element visibility: visible=${visibleRatio}, offScreen=${offScreenRatio}`,
    )

    window.webkit?.messageHandlers?.ElementVisibility?.postMessage({
      textId: textId,
      visibleRatio: visibleRatio,
      offScreenRatio: offScreenRatio,
    })
  }

  clearHighlight() {
    const el = this.#highlightedElement?.deref?.()
    if (el) {
      const activeClass =
        this.#view?.book?.media?.activeClass || "epub-media-overlay-active"
      el.classList.remove(activeClass)
      const doc = el.ownerDocument
      if (doc?.documentElement) {
        const playbackActiveClass = this.#view?.book?.media?.playbackActiveClass
        if (playbackActiveClass) {
          doc.documentElement.classList.remove(playbackActiveClass)
        }
        doc.documentElement.classList.remove("storyteller-readaloud-active")
      }
    }
    this.#highlightedElement = null
    this.#clearReadaloudHighlight()
  }

  // MARK: - Search methods

  async startSearch(query, options = {}) {
    debugLog("FoliateManager", `startSearch(query: "${query}")`)

    if (!this.#view) {
      console.warn("[FM2] startSearch() called but view not initialized")
      window.webkit?.messageHandlers?.SearchError?.postMessage({
        message: "View not initialized",
      })
      return
    }

    const searchOpts = {
      query,
      matchCase: options.matchCase ?? false,
      matchDiacritics: options.matchDiacritics ?? false,
      matchWholeWords: options.matchWholeWords ?? false,
    }

    try {
      for await (const result of this.#view.search(searchOpts)) {
        if (result === "done") {
          window.webkit?.messageHandlers?.SearchComplete?.postMessage({})
        } else if (result.progress !== undefined) {
          window.webkit?.messageHandlers?.SearchProgress?.postMessage({
            progress: result.progress,
          })
        } else if (result.subitems) {
          window.webkit?.messageHandlers?.SearchResults?.postMessage({
            sectionLabel: result.label || "",
            results: result.subitems.map((item) => ({
              cfi: item.cfi,
              pre: item.excerpt?.pre ?? "",
              match: item.excerpt?.match ?? "",
              post: item.excerpt?.post ?? "",
            })),
          })
        }
      }
    } catch (error) {
      console.error("[FM2] Search error:", error)
      window.webkit?.messageHandlers?.SearchError?.postMessage({
        message: error.message || "Search failed",
      })
    }
  }

  clearSearch() {
    debugLog("FoliateManager", "clearSearch()")
    if (!this.#view) {
      console.warn("[FM2] clearSearch() called but view not initialized")
      return
    }
    this.#view.clearSearch()
  }

  async goToCFI(cfi) {
    debugLog("FoliateManager", `goToCFI(cfi: "${cfi}")`)
    if (!this.#view) {
      console.warn("[FM2] goToCFI() called but view not initialized")
      return
    }
    await this.#view.goTo(cfi)
  }

  #getElementPageInfo(el, doc, renderer) {
    if (!el || !doc?.defaultView || !renderer) return null

    const rects = Array.from(el.getClientRects()).filter(
      (rect) => rect.width > 0 && rect.height > 0,
    )
    if (!rects.length) return null

    const defaultView = doc.defaultView
    const frameElement = defaultView.frameElement
    const rendererRect = renderer.getBoundingClientRect?.()
    if (
      !frameElement ||
      !rendererRect ||
      !rendererRect.width ||
      !rendererRect.height
    )
      return null

    const frameRect = frameElement.getBoundingClientRect()
    const viewportRect = {
      left: Math.max(rendererRect.left, frameRect.left),
      right: Math.min(rendererRect.right, frameRect.right),
      top: Math.max(rendererRect.top, frameRect.top),
      bottom: Math.min(rendererRect.bottom, frameRect.bottom),
    }
    if (
      viewportRect.left >= viewportRect.right ||
      viewportRect.top >= viewportRect.bottom
    )
      return null

    const writingMode =
      defaultView.getComputedStyle(doc.body)?.writingMode ?? ""
    if (writingMode.startsWith("vertical")) return null

    const rtl = renderer.getAttribute?.("dir") === "rtl"

    let totalArea = 0
    let visibleArea = 0
    let leftHiddenArea = 0
    let rightHiddenArea = 0

    for (const rect of rects) {
      const area = rect.width * rect.height
      if (!area) continue
      totalArea += area

      const globalLeft = frameRect.left + rect.left
      const globalRight = frameRect.left + rect.right
      const globalTop = frameRect.top + rect.top
      const globalBottom = frameRect.top + rect.bottom

      const overlapLeft = Math.max(globalLeft, viewportRect.left)
      const overlapRight = Math.min(globalRight, viewportRect.right)
      const overlapTop = Math.max(globalTop, viewportRect.top)
      const overlapBottom = Math.min(globalBottom, viewportRect.bottom)
      const overlapWidth = Math.max(0, overlapRight - overlapLeft)
      const overlapHeight = Math.max(0, overlapBottom - overlapTop)

      if (overlapWidth > 0 && overlapHeight > 0) {
        visibleArea += overlapWidth * overlapHeight
      }

      const verticalOverlap = Math.max(
        0,
        Math.min(globalBottom, viewportRect.bottom) -
          Math.max(globalTop, viewportRect.top),
      )
      if (verticalOverlap <= 0) continue

      const leftHiddenWidth = Math.max(
        0,
        Math.min(rect.width, viewportRect.left - globalLeft),
      )
      const rightHiddenWidth = Math.max(
        0,
        Math.min(rect.width, globalRight - viewportRect.right),
      )

      leftHiddenArea += leftHiddenWidth * verticalOverlap
      rightHiddenArea += rightHiddenWidth * verticalOverlap
    }

    if (!totalArea) return null

    return {
      totalArea,
      visibleArea,
      forwardArea: rtl ? leftHiddenArea : rightHiddenArea,
      backwardArea: rtl ? rightHiddenArea : leftHiddenArea,
    }
  }

  #getElementSplitInfo(el, doc, renderer) {
    if (renderer?.scrolled) return null

    const pageInfo = this.#getElementPageInfo(el, doc, renderer)
    if (!pageInfo?.visibleArea || !pageInfo.forwardArea) return null

    // Ignore the part of an overlapping highlight which is behind the current page.
    // Only the visible and forward portions determine whether and when to turn forward.
    const remainingArea = pageInfo.visibleArea + pageInfo.forwardArea
    const visibleRatio = pageInfo.visibleArea / remainingArea
    const forwardRatio = pageInfo.forwardArea / remainingArea

    if (visibleRatio >= 0.98) return null
    if (forwardRatio < 0.1) return null

    return {
      visibleRatio,
      offScreenRatio: forwardRatio,
    }
  }

  // MARK: - User highlight rendering (delegated to BookmarkManager)

  renderHighlights(jsonString) {
    this.#bookmarkManager.renderHighlights(jsonString)
  }

  clearAllHighlights() {
    this.#bookmarkManager.clearAllHighlights()
  }

  removeHighlight(id) {
    this.#bookmarkManager.removeHighlight(id)
  }

  setHighlightPalette(jsonString) {
    this.#bookmarkManager.setSelectionPalette(jsonString)
  }

  setTranslateAvailable(value) {
    this.#bookmarkManager.setTranslateAvailable(value)
  }

  setDefaultHighlightColor(colorId) {
    this.#bookmarkManager.setDefaultColor(colorId)
  }
}

export default FoliateManager
