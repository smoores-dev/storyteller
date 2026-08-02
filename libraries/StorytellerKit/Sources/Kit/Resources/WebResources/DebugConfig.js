export const DEBUG_CATEGORIES = {
  Main: true,
  BookLoader: true,
  FoliateManager: true,
  BookmarkManager: true,
  WebViewCommsBridge: true,

  trace: false,
  overlay: false,
  initial: false,
};

export const DEBUG_CONFIG = {
  anchorFindingMode: 1,
};

export function debugLog(category, ...args) {
  const enabled = DEBUG_CATEGORIES[category];

  if (enabled === undefined) {
    console.warn(`[DebugConfig] Unknown debug category: ${category}`);
    return;
  }

  if (enabled) {
    console.log(`[${category}]`, ...args);
  }
}
