"use client"

import { useSyncExternalStore } from "react"

import { type Clip, clipKey, clipSrc } from "./clip"

export type PlayerSnapshot = {
  clip: Clip | null
  queue: Clip[]
  playing: boolean
  currentTime: number
  duration: number
  rate: number
  unbounded: boolean
}

const emptySnapshot: PlayerSnapshot = {
  clip: null,
  queue: [],
  playing: false,
  currentTime: 0,
  duration: 0,
  rate: 1,
  unbounded: false,
}

const END_EPSILON = 0.05

let snapshot = emptySnapshot
let element: HTMLAudioElement | null = null
let queueIndex = 0
let pendingSeek: number | null = null
const listeners = new Set<() => void>()

function emit(patch: Partial<PlayerSnapshot>): void {
  snapshot = { ...snapshot, ...patch }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): PlayerSnapshot {
  return snapshot
}

function getServerSnapshot(): PlayerSnapshot {
  return emptySnapshot
}

function clipEnd(): number | null {
  if (!snapshot.clip || snapshot.unbounded) return null
  return snapshot.clip.end ?? null
}

function bounds(): { start: number; end: number } {
  const ceiling = snapshot.duration > 0 ? snapshot.duration : Number.MAX_VALUE
  const end = clipEnd()
  if (end === null) return { start: 0, end: ceiling }
  return { start: snapshot.clip?.start ?? 0, end }
}

function advance(): boolean {
  const next = snapshot.queue[queueIndex + 1]
  if (!next) return false
  queueIndex += 1
  load(next, true)
  return true
}

function handleTimeUpdate(): void {
  if (!element) return
  const end = clipEnd()
  if (end !== null && element.currentTime >= end - END_EPSILON) {
    element.pause()
    emit({ currentTime: end, playing: false })
    advance()
    return
  }
  emit({ currentTime: element.currentTime })
}

function handleLoadedMetadata(): void {
  if (!element) return
  if (pendingSeek !== null) {
    element.currentTime = pendingSeek
    pendingSeek = null
  }
  emit({
    duration: Number.isFinite(element.duration) ? element.duration : 0,
    currentTime: element.currentTime,
  })
}

function handleEnded(): void {
  if (advance()) return
  emit({ playing: false })
}

function handlePlay(): void {
  emit({ playing: true })
}

function handlePause(): void {
  emit({ playing: false })
}

function handleRateChange(): void {
  if (!element) return
  emit({ rate: element.playbackRate })
}

function handleError(): void {
  emit({ playing: false })
}

function ensureElement(): HTMLAudioElement | null {
  if (element) return element
  if (typeof document === "undefined") return null
  const audio = document.createElement("audio")
  audio.preload = "metadata"
  audio.addEventListener("timeupdate", handleTimeUpdate)
  audio.addEventListener("loadedmetadata", handleLoadedMetadata)
  audio.addEventListener("ended", handleEnded)
  audio.addEventListener("play", handlePlay)
  audio.addEventListener("pause", handlePause)
  audio.addEventListener("ratechange", handleRateChange)
  audio.addEventListener("error", handleError)
  element = audio
  return audio
}

function start(audio: HTMLAudioElement): void {
  void Promise.resolve(audio.play()).catch(() => {
    emit({ playing: false })
  })
}

function load(clip: Clip, autoplay: boolean): void {
  const from = clip.start ?? 0
  emit({
    clip,
    currentTime: from,
    duration: 0,
    unbounded: false,
    playing: autoplay,
  })
  const audio = ensureElement()
  if (!audio) return
  pendingSeek = from
  audio.src = clipSrc(clip)
  audio.playbackRate = snapshot.rate
  audio.load()
  if (autoplay) start(audio)
}

export function play(clip: Clip): void {
  const current = snapshot.clip
  if (current && clipKey(current) === clipKey(clip)) {
    toggle()
    return
  }
  queueIndex = 0
  emit({ queue: [clip] })
  load(clip, true)
}

export function playAll(clips: Clip[]): void {
  const first = clips[0]
  if (!first) return
  queueIndex = 0
  emit({ queue: clips })
  load(first, true)
}

export function toggle(): void {
  if (!snapshot.clip) return
  const audio = ensureElement()
  if (!audio) {
    emit({ playing: !snapshot.playing })
    return
  }
  if (snapshot.playing) {
    audio.pause()
    emit({ playing: false })
    return
  }
  const end = clipEnd()
  if (end !== null && snapshot.currentTime >= end - END_EPSILON) {
    const from = snapshot.clip.start ?? 0
    audio.currentTime = from
    emit({ currentTime: from })
  }
  emit({ playing: true })
  start(audio)
}

export function seek(seconds: number): void {
  if (!snapshot.clip) return
  const window = bounds()
  const target = Math.min(Math.max(seconds, window.start), window.end)
  emit({ currentTime: target })
  if (element) element.currentTime = target
}

export function skip(delta: number): void {
  seek(snapshot.currentTime + delta)
}

export function wholeFile(): void {
  if (!snapshot.clip || snapshot.unbounded) return
  emit({ unbounded: true })
}

export function stop(): void {
  element?.pause()
  queueIndex = 0
  pendingSeek = null
  emit({
    clip: null,
    queue: [],
    playing: false,
    currentTime: 0,
    duration: 0,
    unbounded: false,
  })
}

export function setRate(rate: number): void {
  emit({ rate })
  if (element) element.playbackRate = rate
}

export function usePlayer() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return {
    clip: state.clip,
    queue: state.queue,
    playing: state.playing,
    currentTime: state.currentTime,
    duration: state.duration,
    rate: state.rate,
    unbounded: state.unbounded,
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
