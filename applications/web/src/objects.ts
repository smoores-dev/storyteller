export function mapValues<Key extends string | symbol, Value, Mapped>(
  record: Partial<Record<Key, Value>>,
  map: (v: Value) => Mapped,
): Record<Key, Mapped> {
  const entries = Object.entries(record) as [Key, Value][]
  const mapped = entries.map(([key, value]) => [key, map(value)]) as [
    Key,
    Mapped,
  ][]
  return Object.fromEntries(mapped) as Record<Key, Mapped>
}

export function entries<Key extends string | symbol, Value>(
  record: Partial<Record<Key, Value>>,
): [Key, Value][] {
  return Object.entries(record) as [Key, Value][]
}
