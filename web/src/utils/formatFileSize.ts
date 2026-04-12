export function formatFileSize(bytes: number | null): string | null {
  if (bytes == null || bytes <= 0) {
    return null
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
