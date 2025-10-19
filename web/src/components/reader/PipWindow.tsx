"use client"

import { createPortal } from "react-dom"

type PiPWindowProps = {
  pipWindow: PictureInPictureWindow
  children: React.ReactNode
}

export default function PiPWindow({ pipWindow, children }: PiPWindowProps) {
  // Copy classes from main window's html and body elements to pip window
  if (
    pipWindow.document.documentElement.className !==
    document.documentElement.className
  ) {
    pipWindow.document.documentElement.className =
      document.documentElement.className
  }

  if (pipWindow.document.body.className !== document.body.className) {
    pipWindow.document.body.className = document.body.className
  }

  return createPortal(children, pipWindow.document.body)
}
