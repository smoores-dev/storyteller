/**
 * VisibilityDetection.js - Archived visibility detection strategies
 *
 * This file contains various approaches for detecting which elements are fully
 * visible on the current page in a paginated ebook reader.
 *
 * CURRENT IMPLEMENTATION: Only strategy1 is used (inline in FoliateManager.js)
 * These are kept for reference and potential future debugging.
 */

import { debugLog } from "./DebugConfig.js";

/**
 * Strategy 1: Fully Contained (WINNER - Currently in use)
 *
 * Finds elements whose start AND end are fully within the range bounds.
 * This gives the most accurate results for elements completely on the current page.
 *
 * Logic: range.start <= element.start AND range.end >= element.end
 */
export function getFullyContainedElements(doc, range) {
  const ids = [];
  try {
    const allElements = doc.querySelectorAll('[id]');

    for (const el of allElements) {
      if (!range.intersectsNode(el)) continue;

      const nodeRange = doc.createRange();
      try {
        nodeRange.selectNodeContents(el);

        const startsAfterRangeStart = range.compareBoundaryPoints(Range.START_TO_START, nodeRange) <= 0;
        const endsBeforeRangeEnd = range.compareBoundaryPoints(Range.END_TO_END, nodeRange) >= 0;

        if (startsAfterRangeStart && endsBeforeRangeEnd) {
          ids.push(el.id);
        }
      } finally {
        nodeRange.detach?.();
      }
    }

    debugLog("VisibilityDetection", `Strategy 1 (fully contained): found ${ids.length} IDs`);
  } catch (err) {
    console.warn("[VisibilityDetection] Strategy 1 failed:", err);
  }
  return ids;
}

/**
 * Strategy 2: Starts After Range Start
 *
 * Finds elements that start at or after the range start.
 * Middle ground between strict and lenient.
 *
 * Logic: range.start <= element.start
 */
export function getElementsStartingAfterRangeStart(doc, range) {
  const ids = [];
  try {
    const allElements = doc.querySelectorAll('[id]');

    for (const el of allElements) {
      if (!range.intersectsNode(el)) continue;

      const nodeRange = doc.createRange();
      try {
        nodeRange.selectNodeContents(el);

        const startComparison = range.compareBoundaryPoints(Range.START_TO_START, nodeRange);
        const isAfterRangeStart = startComparison <= 0;

        if (isAfterRangeStart) {
          ids.push(el.id);
        }
      } finally {
        nodeRange.detach?.();
      }
    }

    debugLog("VisibilityDetection", `Strategy 2 (starts after): found ${ids.length} IDs`);
  } catch (err) {
    console.warn("[VisibilityDetection] Strategy 2 failed:", err);
  }
  return ids;
}

/**
 * Strategy 3: Simple Intersection
 *
 * Most lenient - any element that intersects the range at all.
 * Can include elements partially on previous/next pages.
 *
 * Logic: range.intersectsNode(element)
 */
export function getIntersectingElements(doc, range) {
  const ids = [];
  try {
    const allElements = doc.querySelectorAll('[id]');

    for (const el of allElements) {
      if (range.intersectsNode(el)) {
        ids.push(el.id);
      }
    }

    debugLog("VisibilityDetection", `Strategy 3 (simple intersect): found ${ids.length} IDs`);
  } catch (err) {
    console.warn("[VisibilityDetection] Strategy 3 failed:", err);
  }
  return ids;
}
