import type { DefinePluginOpts, UIPluginOptions, Uppy } from "@uppy/core"
import { UIPlugin } from "@uppy/core"
import dataURItoBlob from "@uppy/utils/lib/dataURItoBlob"
import isObjectURL from "@uppy/utils/lib/isObjectURL"
import type { Body, Meta, UppyFile } from "@uppy/utils/lib/UppyFile"
import { locale } from "./locale"

declare module "@uppy/core" {
  export interface UppyEventMap<M extends Meta, B extends Body> {
    "bookthumbnail:all-generated": () => void
    "bookthumbnail:generated": (file: UppyFile<M, B>, preview: string) => void
    "bookthumbnail:error": (file: UppyFile<M, B>, error: Error) => void
    "bookthumbnail:request": (file: UppyFile<M, B>) => void
    "bookthumbnail:cancel": (file: UppyFile<M, B>) => void
  }
}

/**
 * Save a <canvas> element's content to a Blob object.
 *
 */
async function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | File> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    canvas.getContext("2d")!.getImageData(0, 0, 1, 1)
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === 18) {
      return Promise.reject(
        new Error("cannot read image, probably an svg with external resources"),
      )
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (canvas.toBlob) {
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, type, quality)
    })
    if (blob === null) {
      throw new Error(
        "cannot read image, probably an svg with external resources",
      )
    }
    return blob
  }
  const blob_1 = dataURItoBlob(canvas.toDataURL(type, quality), {})
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (blob_1 === null) {
    throw new Error("could not extract blob, probably an old browser")
  }
  return blob_1
}

/**
 * Make sure the image doesn’t exceed browser/device canvas limits.
 * For ios with 256 RAM and ie
 */
function protect(image: HTMLCanvasElement): HTMLCanvasElement {
  // https://stackoverflow.com/questions/6081483/maximum-size-of-a-canvas-element

  const ratio = image.width / image.height

  const maxSquare = 5000000 // ios max canvas square
  const maxSize = 4096 // ie max canvas dimensions

  let maxW = Math.floor(Math.sqrt(maxSquare * ratio))
  let maxH = Math.floor(maxSquare / Math.sqrt(maxSquare * ratio))
  if (maxW > maxSize) {
    maxW = maxSize
    maxH = Math.round(maxW / ratio)
  }
  if (maxH > maxSize) {
    maxH = maxSize
    maxW = Math.round(ratio * maxH)
  }
  if (image.width > maxW) {
    const canvas = document.createElement("canvas")
    canvas.width = maxW
    canvas.height = maxH
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    canvas.getContext("2d")!.drawImage(image, 0, 0, maxW, maxH)
    return canvas
  }

  return image
}

export type ThumbnailFactory = (
  file: UppyFile<Meta, Record<string, unknown>>,
) => Blob | File | null | Promise<Blob | File | null>

export interface BookThumbnailGeneratorOptions extends UIPluginOptions {
  thumbnailWidth?: number | null
  thumbnailHeight?: number | null
  thumbnailType?: string
  waitForThumbnailsBeforeUpload?: boolean
  lazy?: boolean
  thumbnailFactories?: Record<string, ThumbnailFactory>
}

const defaultOptions = {
  thumbnailWidth: null,
  thumbnailHeight: null,
  thumbnailType: "image/jpeg",
  waitForThumbnailsBeforeUpload: false,
  lazy: false,
  thumbnailFactories: {} as Record<string, ThumbnailFactory>,
}

type Opts = DefinePluginOpts<
  BookThumbnailGeneratorOptions,
  keyof typeof defaultOptions
>

/**
 * The Thumbnail Generator plugin
 */

export default class BookThumbnailGenerator<
  M extends Meta,
  B extends Body,
> extends UIPlugin<Opts, M, B> {
  static VERSION = "0.1.0"

  queue: string[]

  queueProcessing: boolean

  defaultThumbnailDimension: number

  thumbnailType: string

  factories: Record<string, ThumbnailFactory>

  constructor(uppy: Uppy<M, B>, opts?: BookThumbnailGeneratorOptions) {
    super(uppy, { ...defaultOptions, ...opts })
    this.type = "modifier"
    this.id = this.opts.id || "ThumbnailGenerator"
    this.title = "Thumbnail Generator"
    this.queue = []
    this.queueProcessing = false
    this.defaultThumbnailDimension = 200
    this.thumbnailType = this.opts.thumbnailType
    this.factories = this.opts.thumbnailFactories

    this.defaultLocale = locale

    this.i18nInit()

    if (this.opts.lazy && this.opts.waitForThumbnailsBeforeUpload) {
      throw new Error(
        "ThumbnailGenerator: The `lazy` and `waitForThumbnailsBeforeUpload` options are mutually exclusive. Please ensure at most one of them is set to `true`.",
      )
    }
  }

  getFactory(file: UppyFile<Meta, Record<string, unknown>>) {
    return Object.entries(this.factories).find(([typesString]) => {
      const types = typesString.split(",")
      return types.some((type) => {
        if (type.startsWith(".")) {
          return file.name?.endsWith(type)
        }
        if (type.endsWith("/*")) {
          return file.type.startsWith(type.slice(0, type.length - 1))
        }
        return file.type === type
      })
    })?.[1]
  }

  isSupportedType(file: UppyFile<Meta, Record<string, unknown>>) {
    return !!this.getFactory(file)
  }

  async createThumbnail(
    file: UppyFile<M, B>,
    targetWidth: number | null,
    targetHeight: number | null,
  ): Promise<string> {
    const data = await this.getFactory(file)?.(file)
    if (!data) return ""

    const originalUrl = URL.createObjectURL(data)

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.src = originalUrl
      image.addEventListener("load", () => {
        URL.revokeObjectURL(originalUrl)
        resolve(image)
      })
      image.addEventListener("error", (event) => {
        URL.revokeObjectURL(originalUrl)
        reject(
          (event.error as Error | undefined) ||
            new Error("Could not create thumbnail"),
        )
      })
    })

    const dimensions = this.getProportionalDimensions(
      image,
      targetWidth,
      targetHeight,
    )
    const resizedImage = this.resizeImage(
      image,
      dimensions.width,
      dimensions.height,
    )
    const blob = await canvasToBlob(resizedImage, this.thumbnailType, 80)
    return URL.createObjectURL(blob)
  }

  /**
   * Get the new calculated dimensions for the given image and a target width
   * or height. If both width and height are given, only width is taken into
   * account. If neither width nor height are given, the default dimension
   * is used.
   */
  getProportionalDimensions(
    img: HTMLImageElement,
    width: number | null,
    height: number | null,
  ): { width: number; height: number } {
    const aspect = img.width / img.height

    if (width != null) {
      return {
        width,
        height: Math.round(width / aspect),
      }
    }

    if (height != null) {
      return {
        width: Math.round(height * aspect),
        height,
      }
    }

    return {
      width: this.defaultThumbnailDimension,
      height: Math.round(this.defaultThumbnailDimension / aspect),
    }
  }

  /**
   * Resize an image to the target `width` and `height`.
   *
   * Returns a Canvas with the resized image on it.
   */
  resizeImage(
    image: HTMLImageElement,
    targetWidth: number,
    targetHeight: number,
  ): HTMLCanvasElement {
    const canvas = document.createElement("canvas")
    canvas.width = image.width
    canvas.height = image.height

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const context = canvas.getContext("2d")!

    context.drawImage(image, 0, 0, image.width, image.height)

    let img = protect(canvas)

    let steps = Math.ceil(Math.log2(img.width / targetWidth))
    if (steps < 1) {
      steps = 1
    }
    let sW = targetWidth * 2 ** (steps - 1)
    let sH = targetHeight * 2 ** (steps - 1)
    const x = 2

    while (steps--) {
      const resizeCanvas = document.createElement("canvas")
      resizeCanvas.width = sW
      resizeCanvas.height = sH
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      resizeCanvas.getContext("2d")!.drawImage(img, 0, 0, sW, sH)
      img = resizeCanvas

      sW = Math.round(sW / x)
      sH = Math.round(sH / x)
    }

    return img
  }

  /**
   * Set the preview URL for a file.
   */
  setPreviewURL(fileID: string, preview: string): void {
    this.uppy.setFileState(fileID, { preview })
  }

  addToQueue(fileID: string): void {
    this.queue.push(fileID)
    if (!this.queueProcessing) {
      this.processQueue().catch((e: unknown) => {
        throw e
      })
    }
  }

  async processQueue(): Promise<void> {
    this.queueProcessing = true
    if (this.queue.length > 0) {
      const current = this.uppy.getFile(this.queue.shift() as string)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!current) {
        this.uppy.log(
          "[ThumbnailGenerator] file was removed before a thumbnail could be generated, but not removed from the queue. This is probably a bug",
          "error",
        )
        return
      }
      try {
        await this.requestThumbnail(current)
      } catch {
        // pass
      }
      await this.processQueue()
      return
    }
    this.queueProcessing = false
    this.uppy.log("[ThumbnailGenerator] Emptied thumbnail queue")
    this.uppy.emit("bookthumbnail:all-generated")
    return
  }

  async requestThumbnail(file: UppyFile<M, B>): Promise<void> {
    if (this.isSupportedType(file) && !file.isRemote) {
      try {
        const preview = await this.createThumbnail(
          file,
          this.opts.thumbnailWidth,
          this.opts.thumbnailHeight,
        )
        this.setPreviewURL(file.id, preview)
        this.uppy.log(`[ThumbnailGenerator] Generated thumbnail for ${file.id}`)
        this.uppy.emit(
          "bookthumbnail:generated",
          this.uppy.getFile(file.id),
          preview,
        )
      } catch (err) {
        this.uppy.log(
          `[ThumbnailGenerator] Failed thumbnail for ${file.id}:`,
          "warning",
        )
        this.uppy.log(err, "warning")
        this.uppy.emit(
          "bookthumbnail:error",
          this.uppy.getFile(file.id),
          err as Error,
        )
      }
    }
    return Promise.resolve()
  }

  onFileAdded = (file: UppyFile<M, B>): void => {
    if (
      !file.preview &&
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      file.data &&
      this.isSupportedType(file) &&
      !file.isRemote
    ) {
      this.addToQueue(file.id)
    }
  }

  /**
   * Cancel a lazy request for a thumbnail if the thumbnail has not yet been generated.
   */
  onCancelRequest = (file: UppyFile<M, B>): void => {
    const index = this.queue.indexOf(file.id)
    if (index !== -1) {
      this.queue.splice(index, 1)
    }
  }

  /**
   * Clean up the thumbnail for a file. Cancel lazy requests and free the thumbnail URL.
   */
  onFileRemoved = (file: UppyFile<M, B>): void => {
    const index = this.queue.indexOf(file.id)
    if (index !== -1) {
      this.queue.splice(index, 1)
    }

    // Clean up object URLs.
    if (file.preview && isObjectURL(file.preview)) {
      URL.revokeObjectURL(file.preview)
    }
  }

  onRestored = (): void => {
    const restoredFiles = this.uppy.getFiles().filter((file) => file.isRestored)
    restoredFiles.forEach((file) => {
      // Only add blob URLs; they are likely invalid after being restored.
      if (!file.preview || isObjectURL(file.preview)) {
        this.addToQueue(file.id)
      }
    })
  }

  onAllFilesRemoved = (): void => {
    this.queue = []
  }

  waitUntilAllProcessed = (fileIDs: string[]): Promise<void> => {
    fileIDs.forEach((fileID) => {
      const file = this.uppy.getFile(fileID)
      this.uppy.emit("preprocess-progress", file, {
        mode: "indeterminate",
        message: this.i18n("generatingThumbnails"),
      })
    })

    const emitPreprocessCompleteForAll = () => {
      fileIDs.forEach((fileID) => {
        const file = this.uppy.getFile(fileID)
        this.uppy.emit("preprocess-complete", file)
      })
    }

    return new Promise((resolve) => {
      if (this.queueProcessing) {
        this.uppy.once("bookthumbnail:all-generated", () => {
          emitPreprocessCompleteForAll()
          resolve()
        })
      } else {
        emitPreprocessCompleteForAll()
        resolve()
      }
    })
  }

  override install(): void {
    this.uppy.on("file-removed", this.onFileRemoved)
    this.uppy.on("cancel-all", this.onAllFilesRemoved)

    if (this.opts.lazy) {
      this.uppy.on("bookthumbnail:request", this.onFileAdded)
      this.uppy.on("bookthumbnail:cancel", this.onCancelRequest)
    } else {
      this.uppy.on("bookthumbnail:request", this.onFileAdded)
      this.uppy.on("file-added", this.onFileAdded)
      this.uppy.on("restored", this.onRestored)
    }

    if (this.opts.waitForThumbnailsBeforeUpload) {
      this.uppy.addPreProcessor(this.waitUntilAllProcessed)
    }
  }

  override uninstall(): void {
    this.uppy.off("file-removed", this.onFileRemoved)
    this.uppy.off("cancel-all", this.onAllFilesRemoved)

    if (this.opts.lazy) {
      this.uppy.off("bookthumbnail:request", this.onFileAdded)
      this.uppy.off("bookthumbnail:cancel", this.onCancelRequest)
    } else {
      this.uppy.off("bookthumbnail:request", this.onFileAdded)
      this.uppy.off("file-added", this.onFileAdded)
      this.uppy.off("restored", this.onRestored)
    }

    if (this.opts.waitForThumbnailsBeforeUpload) {
      this.uppy.removePreProcessor(this.waitUntilAllProcessed)
    }
  }
}
