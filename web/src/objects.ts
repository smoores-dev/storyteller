export function mapValues<Key extends string | symbol, Value, Mapped>(
  record: Record<Key, Value>,
  map: (v: Value) => Mapped,
): Record<Key, Mapped> {
  const entries = Object.entries(record) as [Key, Value][]
  // This isn't precisely true; it doesn't retain the tuple type without the assertion
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const mapped = entries.map(([key, value]) => [key, map(value)]) as [
    Key,
    Mapped,
  ][]
  return Object.fromEntries(mapped) as Record<Key, Mapped>
}
