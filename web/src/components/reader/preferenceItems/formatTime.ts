export function formatTime(time: number) {
  const hours = Math.floor(time / 3600)
  const minutes = Math.floor(time / 60 - hours * 60)
  const seconds = Math.floor(time - hours * 3600 - minutes * 60)
    .toString()
    .padStart(2, "0")
  if (hours) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds}`
  }
  return `${minutes}:${seconds}`
}

export function formatTimeHuman(time: number) {
  const hours = Math.floor(time / 3600)
  const minutes = Math.floor(time / 60 - hours * 60)

  if (hours) {
    return `${hours} hr ${minutes} min`
  }
  return `${minutes} min`
}
