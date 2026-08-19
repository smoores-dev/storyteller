import { decodeBlurHash } from "fast-blurhash"

const RESOLUTION = 4

const cache = new Map<string, string>()

let sharedCanvas: HTMLCanvasElement | null = null
let sharedCtx: CanvasRenderingContext2D | null = null
let sharedImageData: ImageData | null = null

function ensureCanvas(): {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  imageData: ImageData
} | null {
  if (typeof document === "undefined") return null

  if (!sharedCanvas) {
    sharedCanvas = document.createElement("canvas")
    sharedCanvas.width = RESOLUTION
    sharedCanvas.height = RESOLUTION
    sharedCtx = sharedCanvas.getContext("2d")
    if (sharedCtx) {
      sharedImageData = sharedCtx.createImageData(RESOLUTION, RESOLUTION)
    }
  }

  if (!sharedCtx || !sharedImageData) return null

  return { canvas: sharedCanvas, ctx: sharedCtx, imageData: sharedImageData }
}

export function getBlurhashDataUri(
  blurhash: string | null | undefined,
): string | null {
  if (!blurhash) return null

  const cached = cache.get(blurhash)
  if (cached) return cached

  const shared = ensureCanvas()
  if (!shared) return null

  try {
    const pixels = decodeBlurHash(blurhash, RESOLUTION, RESOLUTION)

    shared.imageData.data.set(pixels)
    shared.ctx.putImageData(shared.imageData, 0, 0)

    const uri = shared.canvas.toDataURL()
    cache.set(blurhash, uri)

    return uri
  } catch {
    return null
  }
}
