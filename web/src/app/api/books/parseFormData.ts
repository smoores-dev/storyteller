function parseDisposition(line: string) {
  const disposition: Record<string, string> = {}
  const tokens = line.trim().split("; ")
  tokens.forEach((element, index) => {
    if (index === 0) return
    const equalityIndex = element.indexOf("=")
    disposition[element.substring(0, equalityIndex)] = element.substring(
      equalityIndex + 2,
      element.length - 1,
    )
  })
  return disposition as { name: string; filename: string }
}

enum ParseState {
  START = "START",
  IN_PREFIX = "IN_PREFIX",
  POST_PREFIX = "POST_PREFIX",
  IN_CONTENT_DISPOSITION_PREFIX = "IN_CONTENT_DISPOSITION_PREFIX",
  IN_CONTENT_DISPOSITION_CRLF = "IN_CONTENT_DISPOSITION_CRLF",
  IN_CONTENT_DISPOSITION = "IN_CONTENT_DISPOSITION",
  IN_CONTENT_TYPE_PREFIX = "IN_CONTENT_TYPE_PREFIX",
  IN_CONTENT_TYPE_CRLF = "IN_CONTENT_TYPE_CRLF",
  IN_CONTENT_TYPE = "IN_CONTENT_TYPE",
  CRLF_START = "CRLF_START",
  LINE_START = "LINE_START",
  PART_START = "PART_START",
  IN_BOUNDARY = "IN_BOUNDARY",
  IN_PART = "IN_PART",
}

function safeSetArray(array: Uint8Array, at: number, byte: number) {
  if (array.length > at) {
    array[at] = byte
    return array
  }
  const next = new Uint8Array(array.length * 2)
  next.set(array)
  next[at] = byte
  return next
}

function pushArray(array: Uint8Array, byte: number) {
  const next = new Uint8Array(array.length + 1)
  next.set(array)
  next[array.length] = byte
  return next
}

export type FormFile = {
  name: string
  filename: string
  type: string
  contents: Blob
  arrayBuffer: () => Promise<ArrayBuffer>
}

export async function parseFormData(
  body: ReadableStream<Uint8Array>,
  boundary: string,
) {
  // debugger
  let state = ParseState.START
  let prefixIndex = 0
  let contentDispositionIndex = 0
  let contentTypeIndex = 0
  let boundaryIndex = 0
  let suffixIndex = 0

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  const contentDispositionPrefixArray = encoder.encode("Content-Disposition: ")
  const contentTypePrefixArray = encoder.encode("Content-Type: ")
  const prefixArray = encoder.encode("--" + boundary + "\r\n")
  const boundaryArray = encoder.encode(boundary + "\r\n")
  const suffixArray = encoder.encode("--" + boundary + "--\r\n")

  const files: Record<string, FormFile[]> = {}
  let currentFile: Partial<FormFile> = {}

  let contentDispositionArray = new Uint8Array(0)
  let contentTypeArray = new Uint8Array(0)
  let contentArraySize = 0
  let contentArray = new Uint8Array(Math.pow(2, 20))
  // @ts-expect-error ReadableStream does in fact have an
  // AsyncIterator signature
  for await (const chunk of body) {
    const chunkArray = new Uint8Array(chunk as ArrayBuffer)

    for (const byte of chunkArray) {
      switch (state) {
        case ParseState.START: {
          if (byte === 45) {
            state = ParseState.IN_PREFIX
            prefixIndex = 1
          }
          break
        }
        case ParseState.IN_PREFIX: {
          if (byte === prefixArray[prefixIndex]) {
            if (prefixIndex === prefixArray.length - 1) {
              state = ParseState.IN_CONTENT_DISPOSITION_PREFIX
              prefixIndex = 0
              currentFile = {}
            } else {
              prefixIndex++
            }
          } else {
            state = ParseState.START
            prefixIndex = 0
          }
          break
        }
        case ParseState.IN_CONTENT_DISPOSITION_PREFIX: {
          if (byte === contentDispositionPrefixArray[contentDispositionIndex]) {
            if (
              contentDispositionIndex ===
              contentDispositionPrefixArray.length - 1
            ) {
              state = ParseState.IN_CONTENT_DISPOSITION
              contentDispositionIndex = 0
            } else {
              contentDispositionIndex++
            }
          } else {
            throw new Error(`Failed to parse (${state})`)
          }
          break
        }
        case ParseState.IN_CONTENT_DISPOSITION: {
          if (byte === 13) {
            state = ParseState.IN_CONTENT_DISPOSITION_CRLF
          } else {
            contentDispositionArray = pushArray(contentDispositionArray, byte)
          }
          break
        }
        case ParseState.IN_CONTENT_DISPOSITION_CRLF: {
          if (byte === 10) {
            state = ParseState.IN_CONTENT_TYPE_PREFIX
            const contentDisposition = parseDisposition(
              decoder.decode(contentDispositionArray),
            )
            currentFile.name = contentDisposition.name
            currentFile.filename = contentDisposition.filename
            contentDispositionArray = new Uint8Array(0)
          } else {
            throw new Error(`Failed to parse (${state})`)
          }
          break
        }
        case ParseState.IN_CONTENT_TYPE_PREFIX: {
          if (byte === contentTypePrefixArray[contentTypeIndex]) {
            if (contentTypeIndex === contentTypePrefixArray.length - 1) {
              contentTypeIndex = 0
              state = ParseState.IN_CONTENT_TYPE
            } else {
              contentTypeIndex++
            }
          } else {
            throw new Error(`Failed to parse (${state})`)
          }
          break
        }
        case ParseState.IN_CONTENT_TYPE: {
          if (byte === 13) {
            state = ParseState.IN_CONTENT_TYPE_CRLF
          } else {
            contentTypeArray = pushArray(contentTypeArray, byte)
          }
          break
        }
        case ParseState.IN_CONTENT_TYPE_CRLF: {
          if (byte === 10) {
            state = ParseState.IN_PART
            const contentType = decoder.decode(contentTypeArray)
            currentFile.type = contentType
            contentTypeArray = new Uint8Array(0)
          } else {
            throw new Error(`Failed to parse (${state})`)
          }
          break
        }
        case ParseState.IN_PART: {
          if (byte === 13) {
            state = ParseState.CRLF_START
          } else {
            if (
              contentArraySize === 3 &&
              contentArray[0] === 13 &&
              contentArray[1] === 10
            ) {
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              contentArray[0] = contentArray[2]!
              contentArraySize = 1
            }
            contentArray = safeSetArray(contentArray, contentArraySize++, byte)
          }
          break
        }
        case ParseState.CRLF_START: {
          if (byte === 10) {
            state = ParseState.LINE_START
          } else {
            contentArray = safeSetArray(contentArray, contentArraySize++, 13)
            state = ParseState.IN_PART
          }
          break
        }
        case ParseState.LINE_START: {
          if (byte === boundaryArray[0]) {
            state = ParseState.IN_BOUNDARY
            boundaryIndex = 1
            suffixIndex = 1
          } else {
            contentArray = safeSetArray(contentArray, contentArraySize++, 13)
            contentArray = safeSetArray(contentArray, contentArraySize++, 10)
            contentArray = safeSetArray(contentArray, contentArraySize++, byte)
            state = ParseState.IN_PART
          }
          break
        }
        case ParseState.IN_BOUNDARY: {
          if (byte === boundaryArray[boundaryIndex]) {
            if (boundaryIndex === boundaryArray.length - 1) {
              const blob = new Blob([
                contentArray.subarray(0, contentArraySize),
              ])
              currentFile.contents = blob
              currentFile.arrayBuffer = () => blob.arrayBuffer()
              if (!currentFile.name)
                throw new Error(`Failed to parse (${state})`)
              if (!files[currentFile.name]) {
                files[currentFile.name] = []
              }
              files[currentFile.name]?.push(currentFile as FormFile)
              currentFile = {}
              contentArraySize = 0
              contentArray = new Uint8Array(Math.pow(2, 20))
              boundaryIndex = 0
              state = ParseState.IN_CONTENT_DISPOSITION_PREFIX
            } else {
              boundaryIndex++
              suffixIndex++
            }
          } else if (byte === suffixArray[suffixIndex]) {
            if (suffixIndex === suffixArray.length - 1) {
              const blob = new Blob([
                contentArray.subarray(0, contentArraySize),
              ])
              currentFile.contents = blob
              currentFile.arrayBuffer = () => blob.arrayBuffer()
              if (!currentFile.name)
                throw new Error(`Failed to parse (${state})`)
              if (!files[currentFile.name]) {
                files[currentFile.name] = []
              }
              files[currentFile.name]?.push(currentFile as FormFile)
              return files
            } else {
              suffixIndex++
            }
          } else {
            for (let j = 0; j < suffixIndex; j++) {
              contentArray = safeSetArray(
                contentArray,
                contentArraySize++,
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                suffixArray[j]!,
              )
            }
            boundaryIndex = 0
            suffixIndex = 0
            state = ParseState.IN_PART
          }
        }
      }
    }
  }
  return files
}
