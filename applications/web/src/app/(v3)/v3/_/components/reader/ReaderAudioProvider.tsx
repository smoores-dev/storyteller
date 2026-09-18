"use client"

import { useEffect, useRef } from "react"

import {
  AudioPlayerService,
  READER_AUDIO_PLAYER_ID,
} from "@/services/AudioPlayerService"

export const ReaderAudioProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const audioRef = useRef<HTMLAudioElement>(null)

  // initialize the audio player service with the audio element
  useEffect(() => {
    if (!audioRef.current) return

    AudioPlayerService.initialize(audioRef.current)

    return () => {
      // AudioPlayer.destroy()
    }
  }, [])

  return (
    <>
      {children}
      <audio ref={audioRef} preload="auto" id={READER_AUDIO_PLAYER_ID} />
    </>
  )
}
