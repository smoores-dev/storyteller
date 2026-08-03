import { debugLog } from "./DebugConfig.js"

const HIGHLIGHT_CLASS = "storyteller-highlight"

export class SpanHighlighter {
  #highlightSpans = new Map()

  add(id, range, color) {
    this.remove(id)

    try {
      const spans = this.#wrapTextNodesInRange(range, id, color)
      if (spans.size > 0) {
        this.#highlightSpans.set(id, spans)
      }
      return spans
    } catch (error) {
      console.error("[SpanHighlighter] Error wrapping text nodes:", error)
      return new Set()
    }
  }

  remove(id) {
    const spans = this.#highlightSpans.get(id)
    if (!spans) return

    for (const span of spans) {
      this.#unwrapSpan(span)
    }
    this.#highlightSpans.delete(id)
  }

  removeAll() {
    for (const id of this.#highlightSpans.keys()) {
      this.remove(id)
    }
  }

  #wrapTextNodesInRange(range, id, color) {
    const textNodes = this.#getTextNodesInRange(range)
    const spans = new Set()

    for (const { node, startOffset, endOffset } of textNodes) {
      const span = this.#wrapTextNodePortion(
        node,
        startOffset,
        endOffset,
        id,
        color,
      )
      if (span) spans.add(span)
    }

    return spans
  }

  #getTextNodesInRange(range) {
    const results = []
    const doc = range.startContainer.ownerDocument

    const walker = doc.createTreeWalker(
      range.commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT

          const nodeRange = doc.createRange()
          nodeRange.selectNodeContents(node)

          if (
            range.compareBoundaryPoints(Range.END_TO_START, nodeRange) >= 0 ||
            range.compareBoundaryPoints(Range.START_TO_END, nodeRange) <= 0
          ) {
            return NodeFilter.FILTER_REJECT
          }
          return NodeFilter.FILTER_ACCEPT
        },
      },
    )

    let node
    while ((node = walker.nextNode())) {
      let startOffset = 0
      let endOffset = node.nodeValue.length

      if (node === range.startContainer) {
        startOffset = range.startOffset
      }
      if (node === range.endContainer) {
        endOffset = range.endOffset
      }

      if (startOffset < endOffset) {
        results.push({ node, startOffset, endOffset })
      }
    }

    return results
  }

  #wrapTextNodePortion(textNode, startOffset, endOffset, id, color) {
    const doc = textNode.ownerDocument
    const fullText = textNode.nodeValue

    if (startOffset === 0 && endOffset === fullText.length) {
      const span = doc.createElement("span")
      span.className = HIGHLIGHT_CLASS
      span.dataset.highlightId = id
      span.style.setProperty("color", color, "important")
      textNode.parentNode.replaceChild(span, textNode)
      span.appendChild(textNode)
      return span
    }

    const beforeText = fullText.slice(0, startOffset)
    const highlightText = fullText.slice(startOffset, endOffset)
    const afterText = fullText.slice(endOffset)

    const parent = textNode.parentNode
    const span = doc.createElement("span")
    span.className = HIGHLIGHT_CLASS
    span.dataset.highlightId = id
    span.style.setProperty("color", color, "important")
    span.textContent = highlightText

    const fragment = doc.createDocumentFragment()
    if (beforeText) fragment.appendChild(doc.createTextNode(beforeText))
    fragment.appendChild(span)
    if (afterText) fragment.appendChild(doc.createTextNode(afterText))

    parent.replaceChild(fragment, textNode)
    return span
  }

  #unwrapSpan(span) {
    const parent = span.parentNode
    if (!parent) return

    while (span.firstChild) {
      parent.insertBefore(span.firstChild, span)
    }
    parent.removeChild(span)
  }
}
