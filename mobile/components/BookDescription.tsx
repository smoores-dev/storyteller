"use dom"

import { type DOMProps } from "expo/dom"

import "@/global.css"

interface Props {
  description?: string | null
  dom?: DOMProps
  textColor?: string
}

export default function BookDescription({ description, textColor }: Props) {
  if (!description) return null

  return (
    <>
      <style>{`
        * {
          color: ${textColor} !important;
        }
      `}</style>
      <div
        className="font-sans text-sm leading-relaxed"
        dangerouslySetInnerHTML={{ __html: description }}
      />
    </>
  )
}
