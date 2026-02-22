/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { decodeAscii } from "./Ascii.ts"

export function encodeBase64(
  inputBytes: Uint8Array,
  paddingCharacter: string | undefined = "=",
  charCodeMap?: Uint8Array,
): string {
  const asciiBuffer = encodeBase64AsAsciiBuffer(
    inputBytes,
    undefined,
    paddingCharacter,
    charCodeMap,
  )

  return decodeAscii(asciiBuffer)
}

export function encodeBase64AsAsciiBuffer(
  inputBytes: Uint8Array,
  asciiBuffer?: Uint8Array,
  paddingCharacter: string | undefined = "=",
  charCodeMap?: Uint8Array,
): Uint8Array {
  if (inputBytes.length === 0) {
    return new Uint8Array(0)
  }

  let paddingCharCode: number

  if (paddingCharacter.length !== 1) {
    throw new Error(`A padding character can only be a single character`)
  } else {
    paddingCharCode = paddingCharacter.charCodeAt(0)
  }

  if (!charCodeMap) {
    charCodeMap = defaultBase64CharCodeMap
  }

  let charCodes: Uint8Array

  if (asciiBuffer) {
    charCodes = asciiBuffer
  } else {
    charCodes = new Uint8Array(Math.floor((inputBytes.length * 4) / 3 + 4))
  }

  const inputBytesLength = inputBytes.length

  let writeOffset = 0
  let readOffset = 0

  while (readOffset <= inputBytesLength - 3) {
    const uint24 =
      (inputBytes[readOffset++]! << 16) |
      (inputBytes[readOffset++]! << 8) |
      inputBytes[readOffset++]!

    charCodes[writeOffset++] = charCodeMap[(uint24 >>> 18) & 63]!
    charCodes[writeOffset++] = charCodeMap[(uint24 >>> 12) & 63]!
    charCodes[writeOffset++] = charCodeMap[(uint24 >>> 6) & 63]!
    charCodes[writeOffset++] = charCodeMap[uint24 & 63]!
  }

  if (readOffset === inputBytesLength - 2) {
    // If two bytes are left, output 3 encoded characters and one padding character
    const uint24 =
      (inputBytes[readOffset++]! << 16) | (inputBytes[readOffset++]! << 8)

    charCodes[writeOffset++] = charCodeMap[(uint24 >>> 18) & 63]!
    charCodes[writeOffset++] = charCodeMap[(uint24 >>> 12) & 63]!
    charCodes[writeOffset++] = charCodeMap[(uint24 >>> 6) & 63]!

    if (paddingCharCode >= 0) {
      charCodes[writeOffset++] = paddingCharCode
    }
  } else if (readOffset === inputBytesLength - 1) {
    // Arrived at last byte at a position that did not complete a full 3 byte set
    const uint24 = inputBytes[readOffset++]! << 16

    charCodes[writeOffset++] = charCodeMap[(uint24 >>> 18) & 63]!
    charCodes[writeOffset++] = charCodeMap[(uint24 >>> 12) & 63]!

    if (paddingCharCode >= 0) {
      charCodes[writeOffset++] = paddingCharCode
      charCodes[writeOffset++] = paddingCharCode
    }
  }

  return charCodes.subarray(0, writeOffset)
}

export const defaultBase64CharCodeMap: Uint8Array = new Uint8Array([
  65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83,
  84, 85, 86, 87, 88, 89, 90, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106,
  107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121,
  122, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 43, 47,
])
