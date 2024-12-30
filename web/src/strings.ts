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
