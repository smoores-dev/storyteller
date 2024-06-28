export function formatNumber(n: number, decimalPlaces: number) {
  const rounded = (
    Math.round(n * 10 ** decimalPlaces) /
    10 ** decimalPlaces
  ).toString()
  if (rounded.includes(".")) return rounded.padEnd(4, "0")
  return rounded + ".00"
}
