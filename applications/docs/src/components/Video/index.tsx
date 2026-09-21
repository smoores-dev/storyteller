import React from "react"

export default function Video(
  props: React.VideoHTMLAttributes<HTMLVideoElement>,
) {
  const { src, ...rest } = props
  return (
    <video {...rest}>
      <source src={src} />
    </video>
  )
}
