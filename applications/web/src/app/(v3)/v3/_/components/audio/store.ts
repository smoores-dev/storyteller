"use client"

import { useSyncExternalStore } from "react"

import {
  type AudioPlayer,
  AudioPlayerService,
  type AudioTrack,
} from "@/services/AudioPlayerService"

import { type Clip, clipKey, clipSrc } from "./clip"

const ALIGNMENT_AUDIO_PLAYER_ID = "alignment-audio-player"

export type PlayerSnapshot = {
  clip: Clip | null
  playing: boolean
  currentTime: number
  duration: number
  rate: number
  unbounded: boolean
}

type ClipTrack = AudioTrack & { clip: Clip }

const emptySnapshot: PlayerSnapshot = {
  clip: null,
  playing: false,
  currentTime: 0,
  duration: 0,
  rate: 1,
  unbounded: false,
}

let player: AudioPlayer | null = null
let snapshot = emptySnapshot
const listeners = new Set<() => void>()

function getPlayer(): AudioPlayer {
  if (player) return player

  const audioElement = document.createElement("audio")
  audioElement.id = ALIGNMENT_AUDIO_PLAYER_ID
  audioElement.preload = "metadata"
  const created = AudioPlayerService.initialize(audioElement)
  created.subscribe((state) => {
    const track = created.getActiveTrack() as ClipTrack | null
    snapshot = {
      clip: track?.clip ?? null,
      playing: state.playing,
      currentTime: state.currentTime,
      duration: state.duration,
      rate: state.playbackRate,
      unbounded:
        track !== null &&
        track.clip.end !== undefined &&
        track.end === undefined,
    }
    for (const listener of listeners) listener()
  })
  player = created
  return created
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function toTrack(clip: Clip): ClipTrack {
  const src = clipSrc(clip)
  return {
    id: clipKey(clip),
    src,
    url: src,
    relativeUrl: "",
    type: "audio/mpeg",
    title: clip.label,
    start: clip.start,
    end: clip.end,
    clip,
  }
}

export function play(clip: Clip): void {
  const activePlayer = getPlayer()
  const active = activePlayer.getActiveTrack()
  if (active && active.id === clipKey(clip)) {
    void activePlayer.togglePlay()
    return
  }
  void activePlayer.replacePlaylist([toTrack(clip)])
  void activePlayer.play()
}

export function playAll(clips: Clip[]): void {
  if (clips.length === 0) return
  const activePlayer = getPlayer()
  void activePlayer.replacePlaylist(clips.map(toTrack))
  void activePlayer.play()
}

export function toggle(): void {
  void getPlayer().togglePlay()
}

export function seek(seconds: number): void {
  const activePlayer = getPlayer()
  const track = activePlayer.getActiveTrack()
  if (!track) return
  if (track.end == null) {
    activePlayer.seekTo(Math.max(seconds, 0))
    return
  }
  activePlayer.seekTo(Math.min(Math.max(seconds, track.start ?? 0), track.end))
}

export function skip(delta: number): void {
  seek(snapshot.currentTime + delta)
}

export function wholeFile(): void {
  getPlayer().clearActiveTrackBounds()
}

export function stop(): void {
  const activePlayer = getPlayer()
  void activePlayer.replacePlaylist([])
  activePlayer.pause()
  activePlayer.seekTo(0)
}

export function setRate(rate: number): void {
  getPlayer().setPlaybackRate(rate)
}

export function usePlayer() {
  const state = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => emptySnapshot,
  )

  return {
    ...state,
    play,
    playAll,
    toggle,
    seek,
    skip,
    wholeFile,
    stop,
    setRate,
  }
}
