"use client"

import { useEffect, useRef } from "react"

import { AudioPlayer } from "@/services/AudioPlayerService"

export const AudioProviderRedux = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const audioRef = useRef<HTMLAudioElement>(null)

  // initialize the audio player service with the audio element
  useEffect(() => {
    if (!audioRef.current) return

    AudioPlayer.initialize(audioRef.current)

    return () => {
      // AudioPlayer.destroy()
    }
  }, [])

  return (
    <>
      {children}
      <audio ref={audioRef} preload="auto" />
    </>
  )
}
