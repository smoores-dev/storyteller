export function round(n: number, r: number) {
  return Math.round(n * Math.pow(10, r)) / Math.pow(10, r)
}

export function formatBytes(bytes: number) {
  const kilobytes = round(bytes / 1000, 2)
  if (kilobytes < 1) return `${bytes} B`
  const megabytes = round(kilobytes / 1000, 2)
  if (megabytes < 1) return `${kilobytes} KB`
  const gigabytes = round(megabytes / 1000, 2)
  if (gigabytes < 1) return `${megabytes} MB`
  return `${gigabytes.toFixed(2)} GB`
}

// source: https://gist.github.com/fabiospampinato/d6d7ec6503f403532ab7b18e99cf9808
export const emojiRegex =
  /(?:\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?|\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200d(?:\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?|\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*/gu
