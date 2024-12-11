export function quotePath(path: string) {
  return `"${path.replaceAll(/"/g, '\\"')}"`
}
