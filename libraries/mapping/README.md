# `@storyteller/mapping`

A library for tracking mutations across integer addressed data models (e.g.,
strings).

## Example usage

```ts
// a b c d e
// aaa bbbb ccc dddd eee
const mapping = new Mapping()
mapping.insertMap(0, 1, 3)
mapping.insertMap(2, 1, 4)
mapping.insertMap(4, 1, 3)
mapping.insertMap(6, 1, 4)
mapping.insertMap(8, 1, 3)

const cursor = mapping.cursor()

assert.strictEqual(cursor.map(0), 0)
assert.strictEqual(cursor.map(1), 3)
assert.strictEqual(cursor.map(2), 4)
assert.strictEqual(cursor.map(3), 8)
assert.strictEqual(cursor.map(4), 9)
assert.strictEqual(cursor.map(5), 12)
```
