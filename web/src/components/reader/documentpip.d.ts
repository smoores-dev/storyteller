declare global {
  interface PictureInPictureResizeEvent extends Event {
    readonly target: PictureInPictureWindow | null
  }

  interface PictureInPictureWindow extends Window {
    readonly width: number
    readonly height: number
    onresize(
      this: PictureInPictureWindow,
      ev: PictureInPictureResizeEvent,
    ): void
    // addEventListener(
    //   type: "resize",
    //   listener:
    //   options?: boolean | AddEventListenerOptions,
    // ): void
    // removeEventListener(
    //   type: "resize",
    //   listener: EventListenerOrEventListenerObject,
    //   options?: boolean | EventListenerOptions,
    // ): void
  }

  interface PictureInPictureEvent extends Event {
    readonly pictureInPictureWindow: PictureInPictureWindow
  }

  type PictureInPictureEventListener =
    | ((this: HTMLVideoElement, ev: PictureInPictureEvent) => void)
    | null

  interface HTMLVideoElement {
    autoPictureInPicture: boolean
    disablePictureInPicture: boolean
    requestPictureInPicture(): Promise<PictureInPictureWindow>
    onenterpictureinpicture: PictureInPictureEventListener
    onleavepictureinpicture: PictureInPictureEventListener
  }

  interface Document {
    readonly pictureInPictureEnabled: boolean
    exitPictureInPicture(): Promise<void>
  }

  interface DocumentOrShadowRoot {
    readonly pictureInPictureElement: HTMLVideoElement | null
  }

  interface Window {
    documentPictureInPicture?: {
      requestWindow: (opts?: {
        width?: number
        height?: number
        disallowReturnToOpener?: boolean
      }) => Promise<PictureInPictureWindow>
      window: PictureInPictureWindow | null
      addEventListener: (
        type: "resize",
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
      ) => void
      removeEventListener: (
        type: "resize",
        listener: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions,
      ) => void
    }
  }
}

export {}
