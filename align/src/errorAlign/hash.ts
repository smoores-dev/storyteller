/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * TypeScript implementation of Python's built-in hash() function.
 *
 * Matches CPython for:
 *   • int / bigint  — exact
 *   • float         — exact
 *   • bool          — exact  (True → 1, False → 0)
 *   • str           — exact when PYTHONHASHSEED=0; Python randomises by default
 *   • tuple         — exact, CPython 3.8+ xxHash-based algorithm
 *                     (pass a readonly array to represent a tuple)
 *
 * hash(None) is intentionally unsupported: Python derives it from object
 * identity (memory address), which cannot be replicated portably.
 */

export type Hashable = number | bigint | string | boolean | readonly Hashable[]

// ─── Constants ───────────────────────────────────────────────────────────────

/** 2^61 − 1  (Mersenne prime used throughout Python's numeric hashing) */
const MODULUS = (1n << 61n) - 1n
const UINT64_MASK = (1n << 64n) - 1n

/** Hash values for special floats (matches sys.hash_info in CPython). */
const HASH_INF = 314159
const HASH_NAN = 0

/** xxHash constants used by CPython 3.8+ tuple hashing. */
const XX_PRIME_1 = 11400714785074694791n
const XX_PRIME_2 = 14029467366897019727n
const XX_PRIME_5 = 2870177450012600261n

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rotl64(v: bigint, s: bigint): bigint {
  return ((v << s) | (v >> (64n - s))) & UINT64_MASK
}

function modpow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n
  base %= mod
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod
    base = (base * base) % mod
    exp >>= 1n
  }
  return result
}

// ─── Integer hashing ─────────────────────────────────────────────────────────
//
// Python computes  sign(n) × (|n| mod M),  then maps the C sentinel −1 → −2.

function hashBigInt(n: bigint): number {
  const neg = n < 0n
  const x = (neg ? -n : n) % MODULUS
  const h = neg ? -Number(x) : Number(x)
  return h === -1 ? -2 : h
}

// ─── Float hashing ───────────────────────────────────────────────────────────
//
// Decomposes the double into  sign × m × 2^e  (integer m, integer e), then
// computes  sign × m × 2^e  mod M.  Because 2^61 ≡ 1 (mod M) the exponent
// can be reduced mod 61, elegantly handling negative exponents without division.

function hashFloat(x: number): number {
  if (isNaN(x)) return HASH_NAN
  if (!isFinite(x)) return x > 0 ? HASH_INF : -HASH_INF
  if (x === 0) return 0

  // Read the raw IEEE 754 bits via DataView (big-endian layout).
  const buf = new ArrayBuffer(8)
  const dv = new DataView(buf)
  dv.setFloat64(0, x)
  const hi = dv.getUint32(0)
  const lo = dv.getUint32(4)

  const sign = hi >>> 31 ? -1 : 1
  const biasedExp = (hi >>> 20) & 0x7ff
  const mantHi = hi & 0xfffff

  let m: bigint
  let e: number
  if (biasedExp === 0) {
    // Subnormal: no implicit leading 1; true exponent = 1 − 1023 − 52
    m = (BigInt(mantHi) << 32n) | BigInt(lo)
    e = 1 - 1023 - 52
  } else {
    // Normal: restore the implicit leading 1
    m = (1n << 52n) | (BigInt(mantHi) << 32n) | BigInt(lo)
    e = biasedExp - 1023 - 52
  }

  // 2^61 ≡ 1 (mod M)  →  reduce e mod 61, keeping it non-negative
  const eMod = ((BigInt(e) % 61n) + 61n) % 61n
  const h = ((m % MODULUS) * modpow(2n, eMod, MODULUS)) % MODULUS
  const r = sign * Number(h)
  return r === -1 ? -2 : r
}

// ─── SipHash-1-3 ─────────────────────────────────────────────────────────────
//
// Python 3 hashes strings with SipHash-1-3 (1 compression round, 3 finalisation
// rounds).  With PYTHONHASHSEED=0 the 128-bit key is (0, 0).

function sipRound(v: bigint[]): void {
  v[0] = (v[0]! + v[1]!) & UINT64_MASK
  v[1] = rotl64(v[1]!, 13n) ^ v[0]
  v[0] = rotl64(v[0], 32n)
  v[2] = (v[2]! + v[3]!) & UINT64_MASK
  v[3] = rotl64(v[3]!, 16n) ^ v[2]
  v[0] = (v[0] + v[3]) & UINT64_MASK
  v[3] = rotl64(v[3], 21n) ^ v[0]
  v[2] = (v[2] + v[1]) & UINT64_MASK
  v[1] = rotl64(v[1], 17n) ^ v[2]
  v[2] = rotl64(v[2], 32n)
}

function siphash13(bytes: Uint8Array, k0 = 0n, k1 = 0n): bigint {
  const v = [
    k0 ^ 0x736f6d6570736575n,
    k1 ^ 0x646f72616e646f6dn,
    k0 ^ 0x6c7967656e657261n,
    k1 ^ 0x7465646279746573n,
  ]

  // Process full 8-byte blocks (little-endian word order)
  const blocks = Math.floor(bytes.length / 8)
  for (let i = 0; i < blocks; i++) {
    let m = 0n
    for (let j = 0; j < 8; j++) m |= BigInt(bytes[i * 8 + j]!) << BigInt(j * 8)
    v[3]! ^= m
    sipRound(v)
    v[0]! ^= m
  }

  // Final partial block: (length & 0xff) in the MSB, remaining bytes in LE order
  const rem = bytes.length % 8
  const base = blocks * 8
  let last = BigInt(bytes.length & 0xff) << 56n
  for (let i = 0; i < rem; i++)
    last |= BigInt(bytes[base + i]!) << BigInt(i * 8)
  v[3]! ^= last
  sipRound(v)
  v[0]! ^= last

  // Finalisation: 3 rounds
  v[2]! ^= 0xffn
  sipRound(v)
  sipRound(v)
  sipRound(v)

  return (v[0]! ^ v[1]! ^ v[2]! ^ v[3]!) & UINT64_MASK
}

// ─── String encoding ─────────────────────────────────────────────────────────
//
// CPython stores strings in the narrowest encoding that fits all code points:
//   • all chars ≤ U+00FF  →  1 byte  per char  (Latin-1 compact)
//   • all chars ≤ U+FFFF  →  2 bytes per char  (UCS-2, little-endian)
//   • otherwise           →  4 bytes per char  (UCS-4, little-endian)
// SipHash is run on these raw bytes, so we must replicate the same layout.
//
// On big-endian Python builds the layout would differ; this implementation
// targets the (overwhelmingly common) little-endian case.

function encodeString(s: string): Uint8Array {
  // eslint-disable-next-line @typescript-eslint/no-misused-spread
  const codePoints = [...s].map((c) => c.codePointAt(0)!) // handles surrogates
  const maxCp = codePoints.reduce((m, cp) => (cp > m ? cp : m), 0)

  if (maxCp <= 0xff) {
    return new Uint8Array(codePoints)
  }

  const bpc = maxCp <= 0xffff ? 2 : 4
  const buf = new Uint8Array(codePoints.length * bpc)
  const dv = new DataView(buf.buffer)
  codePoints.forEach((cp, i) => {
    if (bpc === 2) dv.setUint16(i * 2, cp, /*LE*/ true)
    else dv.setUint32(i * 4, cp, /*LE*/ true)
  })
  return buf
}

function hashString(s: string): number {
  const raw = siphash13(encodeString(s)) // unsigned uint64
  const signed =
    raw > 0x7fffffffffffffffn // → signed int64
      ? Number(raw - (1n << 64n))
      : Number(raw)
  return signed === -1 ? -2 : signed
}

// ─── Tuple hashing (CPython 3.8+, xxHash-inspired) ───────────────────────────

function hashTuple(items: readonly Hashable[]): number {
  let acc = XX_PRIME_5

  for (const item of items) {
    // The C code works with unsigned lane values, so reinterpret signed → unsigned.
    const h = hash(item)
    const lane = h < 0 ? BigInt(h) + (1n << 64n) : BigInt(h)
    acc = (acc + lane * XX_PRIME_2) & UINT64_MASK
    acc = rotl64(acc, 31n)
    acc = (acc * XX_PRIME_1) & UINT64_MASK
  }

  acc = (acc + (BigInt(items.length) ^ (XX_PRIME_5 ^ 3527539n))) & UINT64_MASK

  // (uint64_t)-1 is the C sentinel; CPython maps it to a fixed value instead.
  if (acc === UINT64_MASK) return 1546275796

  const signed =
    acc > 0x7fffffffffffffffn ? Number(acc - (1n << 64n)) : Number(acc)
  return signed === -1 ? -2 : signed
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Compute Python's `hash()` for the given value.
 *
 * Supports: `boolean`, `number` (int & float), `bigint`, `string`, and tuples
 * (represented as `readonly` arrays).
 *
 * **String hashing** is deterministic only when `PYTHONHASHSEED=0`.
 * Python randomises string hashes by default, so results will differ from a
 * live Python session unless you `export PYTHONHASHSEED=0` before running it.
 */
export function hash(value: Hashable): number {
  if (typeof value === "boolean") return value ? 1 : 0
  if (typeof value === "number")
    return Number.isInteger(value)
      ? hashBigInt(BigInt(value))
      : hashFloat(value)
  if (typeof value === "bigint") return hashBigInt(value)
  if (typeof value === "string") return hashString(value)
  if (Array.isArray(value)) return hashTuple(value as readonly Hashable[])
  throw new TypeError(`unhashable type: ${typeof value}`)
}
