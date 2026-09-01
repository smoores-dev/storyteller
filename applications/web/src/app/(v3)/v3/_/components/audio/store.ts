"use client"

// yes yes this should be in redux ill do that when i do this properly

import { useSyncExternalStore } from "react"

import {
  type AudioPlayer,
  AudioPlayerService,
  type AudioTrack,
} from "@/services/AudioPlayerService"

import { type Clip, clipKey, clipSrc } from "./clip"

export const ALIGNMENT_AUDIO_PLAYER_ID = "alignment-audio-player"
export type PlayerSnapshot = {
  clip: Clip | null
  playing: boolean
  currentTime: number
  duration: number
  rate: number
  unbounded: boolean
}

type ClipTrack = AudioTrack & {
  clip: Clip
}

const emptySnapshot: PlayerSnapshot = {
  clip: null,
  playing: false,
  currentTime: 0,
  duration: 0,
  rate: 1,
  unbounded: false,
}
let player: AudioPlayer | null = null

function getPlayer() {
  if (player) {
    return player
  }

  let audioElement = document.getElementById(
    ALIGNMENT_AUDIO_PLAYER_ID,
  ) as HTMLAudioElement | null
  if (!audioElement) {
    console.log("creating audio element")
    audioElement = document.createElement("audio")
    audioElement.id = ALIGNMENT_AUDIO_PLAYER_ID
    audioElement.preload = "metadata"
  }
  player = AudioPlayerService.initialize(audioElement)
  console.log("player", player)
  return player
}

let snapshot = emptySnapshot

function toTrack(clip: Clip): AudioTrack {
  return {
    id: clipKey(clip),
    src: clipSrc(clip),
    relativeUrl: "",
    type: "audio/mpeg",
    url: clipSrc(clip),
    start: clip.start,
    end: clip.end,
    clip,
  }
}

function subscribe(onChange: () => void) {
  const player = getPlayer()
  return player.subscribe((state) => {
    const track = player.getActiveTrack() as ClipTrack | null
    snapshot = {
      clip: track?.clip ?? null,
      currentTime: state.currentTime,
      duration: state.duration,
      rate: state.playbackRate,
      unbounded: track?.clip.end === undefined && track?.end === undefined,
      playing: state.playing,
    }
    onChange()
  })
}

export function usePlayer() {
  const state = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => emptySnapshot,
  )

  return {
    ...state,
    play: (clip: Clip) => {
      console.log("playing")
      const track = toTrack(clip)
      void getPlayer().replacePlaylist([track])
      void getPlayer().play()
    },
    pause: () => {
      getPlayer().pause()
    },
    seek: (time: number) => {
      getPlayer().seekTo(time)
    },
    setPlaybackRate: (rate: number) => {
      getPlayer().setPlaybackRate(rate)
    },
    toggle: () => {
      void getPlayer().togglePlay()
    },
  }
}
