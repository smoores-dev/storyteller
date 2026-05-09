export function minutesToCronExpression(minutes: number): string {
  if (minutes < 1) {
    return "* * * * *"
  }

  if (minutes < 60 && 60 % minutes === 0) {
    return `*/${minutes} * * * *`
  }

  const hours = Math.floor(minutes / 60)
  if (hours >= 1 && hours <= 24 && 24 % hours === 0) {
    const remainderMinutes = minutes % 60
    return `${remainderMinutes} */${hours} * * *`
  }

  return `0 */${Math.max(1, hours)} * * *`
}

export function cronExpressionToMinutes(expression: string): number | null {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) return null

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts

  const isWildcard = (v: string | undefined) => v === "*"
  if (!isWildcard(dayOfMonth) || !isWildcard(month) || !isWildcard(dayOfWeek)) {
    return null
  }

  // */N * * * * -> every N minutes
  const minuteStep = minute?.match(/^\*\/(\d+)$/)
  if (minuteStep && isWildcard(hour)) {
    return parseInt(minuteStep[1] ?? "0", 10)
  }

  // M */H * * * -> every H hours (offset by M minutes)
  const hourStep = hour?.match(/^\*\/(\d+)$/)
  if (hourStep && minute !== undefined) {
    const h = parseInt(hourStep[1] ?? "0", 10)
    const m = parseInt(minute, 10)

    if (!isNaN(m)) {
      return h * 60 + m
    }
  }

  return null
}
