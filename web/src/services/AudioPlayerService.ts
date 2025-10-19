/* eslint-disable no-console */
import { type TocItem } from "@/components/reader/BookService"

export type RepeatMode = "track" | "playlist"

export type AudioTrack = {
  id: string | number
  src: string
  relativeUrl: string
  type: string
  fallbacks?: Pick<AudioTrack, "src" | "type">[]
  url: string
  duration?: number
  title?: string
  artist?: string
  album?: string
  artwork?: string | MediaImage[]
  tocItem?: TocItem | undefined
} & Record<string, unknown>

export type AudioState = {
  playing: boolean
  loading: boolean
  duration: number
  timeLeft: number
  currentTime: number
  muted: boolean
  shuffle: boolean
  repeat: RepeatMode
  volume: number
  playbackRate: number
  trackIndex: number
  start: number
  buffered: number
  progressPercentage: number
  error: string | null
  retryCount: number
  stalled: boolean
  updateInterval: number
}

type AudioStateListener = (state: AudioState) => void

// singleton audio player service that can be used from anywhere
class AudioPlayerService {
  private audioElement: HTMLAudioElement | null = null
  private playlist: AudioTrack[] = []
  private state: AudioState = {
    playing: false,
    loading: false,
    duration: 0,
    timeLeft: 0,
    currentTime: 0,
    muted: false,
    shuffle: true,
    repeat: "playlist",
    volume: 100,
    playbackRate: 1,
    trackIndex: 0,
    buffered: 0,
    progressPercentage: 0,
    error: null,
    retryCount: 0,
    stalled: false,
    start: 0,
    updateInterval: 200,
  }

  private listeners: Set<AudioStateListener> = new Set()
  private isSafari = false
  private startMargin = 5

  constructor() {
    // detect safari
    this.isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
    this.setupMediaSession()
  }

  initialize(element: HTMLAudioElement) {
    this.audioElement = element
    this.setupEventHandlers()
  }

  // subscribe to state changes
  subscribe(listener: AudioStateListener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => {
      listener({ ...this.state })
    })
  }

  private updateState(update: Partial<AudioState>) {
    this.state = { ...this.state, ...update }
    this.notifyListeners()
  }
  private lastTimeUpdate = 0

  /**
   * in chromium, we occassionally get two ended events, this prevents us from skipping two tracks
   */
  private skipLock = false

  private setupEventHandlers() {
    if (!this.audioElement) return

    this.audioElement.addEventListener("play", () => {
      this.updateState({ playing: true })
    })

    this.audioElement.addEventListener("pause", () => {
      this.updateState({ playing: false })
    })

    this.audioElement.addEventListener("loadedmetadata", () => {
      if (!this.audioElement) return
      const duration =
        this.audioElement.duration === Infinity ? 0 : this.audioElement.duration
      this.updateState({
        duration,
        timeLeft: duration,
        error: null,
        retryCount: 0,
      })
      this.updateMediaSessionPositionState()
    })

    this.audioElement.addEventListener("timeupdate", () => {
      if (!this.audioElement) return
      // only update within the update interval
      const currentTime = this.audioElement.currentTime
      const duration = this.audioElement.duration
      const progressPercentage =
        duration > 0 ? (currentTime / duration) * 100 : 0
      if (Date.now() - this.lastTimeUpdate < this.state.updateInterval) {
        return
      }
      if (this.skipLock) {
        this.skipLock = false
      }
      this.lastTimeUpdate = Date.now()
      this.updateState({
        currentTime,
        timeLeft: duration - currentTime,
        progressPercentage,
        duration: duration === Infinity ? 0 : duration,
        playing: !this.audioElement.paused,
      })
    })

    this.audioElement.addEventListener("volumechange", () => {
      if (!this.audioElement) return
      this.updateState({ volume: Math.trunc(this.audioElement.volume * 100) })
    })

    this.audioElement.addEventListener("progress", () => {
      if (!this.audioElement) return
      if (this.audioElement.buffered.length > 0) {
        const bufferedEnd = this.audioElement.buffered.end(
          this.audioElement.buffered.length - 1,
        )
        const bufferedPercentage =
          this.audioElement.duration > 0
            ? (bufferedEnd / this.audioElement.duration) * 100
            : 0
        this.updateState({ buffered: bufferedPercentage })
      }
    })

    this.audioElement.addEventListener("ratechange", () => {
      if (!this.audioElement) return
      this.updateState({ playbackRate: this.audioElement.playbackRate })
    })

    this.audioElement.addEventListener("error", () => {
      if (!this.audioElement) return
      const error = this.audioElement.error
      let errorMessage = "Unknown audio error"

      if (error) {
        switch (error.code) {
          case error.MEDIA_ERR_ABORTED:
            errorMessage = "Audio playback was aborted"
            break
          case error.MEDIA_ERR_NETWORK:
            errorMessage = "Network error occurred while loading audio"
            break
          case error.MEDIA_ERR_DECODE:
            errorMessage = "Audio decoding error"
            break
          case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMessage = "Audio format not supported"
            break
        }
      }

      this.updateState({ error: errorMessage })
      console.error("Audio error:", errorMessage, error)
    })

    this.audioElement.addEventListener("stalled", () => {
      this.updateState({ stalled: true })
      console.warn("Audio playback stalled")
    })

    this.audioElement.addEventListener("waiting", () => {
      this.updateState({ loading: true })
    })

    this.audioElement.addEventListener("canplay", () => {
      this.updateState({ loading: false, stalled: false })
    })

    this.audioElement.addEventListener("loadstart", () => {
      this.updateState({ loading: true })
    })

    this.audioElement.addEventListener("ended", async () => {
      if (this.skipLock) {
        return
      }

      this.skipLock = true

      if (this.state.repeat === "track") {
        await this.play()
      } else {
        await this.skipToNext()
        await this.play()
      }
    })
  }

  private setupMediaSession() {
    if (!("mediaSession" in navigator)) {
      console.warn("Media Session API not supported")
      return
    }

    navigator.mediaSession.setActionHandler("play", async () => {
      await this.play()
    })

    navigator.mediaSession.setActionHandler("pause", () => {
      this.pause()
    })

    navigator.mediaSession.setActionHandler("previoustrack", async () => {
      await this.skipToPrevious()
    })

    navigator.mediaSession.setActionHandler("nexttrack", async () => {
      await this.skipToNext()
    })

    navigator.mediaSession.setActionHandler("seekbackward", (details) => {
      const seekOffset = details.seekOffset || 10
      this.seekBy(-seekOffset)
    })

    navigator.mediaSession.setActionHandler("seekforward", (details) => {
      const seekOffset = details.seekOffset || 10
      this.seekBy(seekOffset)
    })

    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime !== undefined) {
        this.seekTo(details.seekTime)
      }
    })

    navigator.mediaSession.setActionHandler("stop", () => {
      this.pause()
      this.seekTo(0)
    })
  }

  private updateMediaSessionMetadata() {
    if (!("mediaSession" in navigator)) return

    const track = this.getActiveTrack()
    if (!track) {
      navigator.mediaSession.metadata = null
      return
    }

    const artwork = track.artwork
      ? typeof track.artwork === "string"
        ? [{ src: track.artwork }]
        : track.artwork
      : []

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || "Unknown Title",
      artist: track.artist || "Unknown Artist",
      album: track.album || "Unknown Album",
      artwork,
    })
  }

  private updateMediaSessionPositionState() {
    if (!("mediaSession" in navigator)) return
    if (!this.audioElement) return

    const duration = this.state.duration
    const position = this.state.currentTime
    const playbackRate = this.state.playbackRate

    // only update if we have valid duration
    if (duration > 0 && !isNaN(duration) && isFinite(duration)) {
      try {
        navigator.mediaSession.setPositionState({
          duration,
          position: Math.min(position, duration),
          playbackRate,
        })
      } catch (error) {
        console.warn("Failed to update position state:", error)
      }
    }
  }

  private updateMediaSessionPlaybackState() {
    if (!("mediaSession" in navigator)) return
    navigator.mediaSession.playbackState = this.state.playing
      ? "playing"
      : "paused"
  }

  async play() {
    if (!this.audioElement) throw new Error("Audio element not initialized")
    if (!this.audioElement.paused) return

    await this.audioElement.play()
    this.updateState({ playing: true })

    this.updateMediaSessionPlaybackState()
  }

  pause() {
    if (!this.audioElement) throw new Error("Audio element not initialized")
    this.audioElement.pause()
    this.updateState({ playing: false })
    this.updateMediaSessionPlaybackState()
  }

  async togglePlay() {
    if (this.audioElement?.paused) {
      await this.play()
    } else {
      this.pause()
    }
  }

  setVolume(volume: number) {
    if (!this.audioElement) return
    const normalized = Math.min(Math.max(0, volume), 100)

    this.audioElement.volume = normalized / 100
  }

  setPlaybackRate(rate: number) {
    if (!this.audioElement) return
    this.audioElement.playbackRate = rate
    this.updateMediaSessionPositionState()
  }

  seekTo(time: number) {
    if (!this.audioElement) return
    const normalized = Math.min(
      Math.max(0, time),
      isNaN(this.audioElement.duration)
        ? 1e11
        : this.audioElement.duration || 0,
    )
    this.audioElement.currentTime = normalized
    this.lastTimeUpdate = Date.now()

    this.updateState({
      currentTime: normalized,
      timeLeft: this.audioElement.duration - normalized,
      progressPercentage: (normalized / this.audioElement.duration) * 100,
      duration: this.audioElement.duration,
    })
    this.updateMediaSessionPositionState()
  }

  seekBy(step: number) {
    if (!this.audioElement) return
    this.seekTo(this.audioElement.currentTime + step)
  }

  async skip(trackIndex: number, startTime: number = 0) {
    if (trackIndex < 0 || trackIndex >= this.playlist.length) {
      console.error("Invalid track index", trackIndex)
      return
    }

    const track = this.playlist[trackIndex]
    if (!track || !this.audioElement) return

    const isTrackDifferent =
      trackIndex !== this.state.trackIndex ||
      !this.audioElement.src.includes(track.src)

    const wasPlaying = !this.audioElement.paused
    if (isTrackDifferent) {
      if (wasPlaying) {
        this.audioElement.pause()
      }

      const newSrc =
        this.isSafari && startTime > 0
          ? `${track.src}#t=${startTime}`
          : track.src

      this.audioElement.src = newSrc
      if (track.type) {
        this.audioElement.load()
      }

      this.updateState({ trackIndex, start: startTime })
      this.updateMediaSessionMetadata()
      this.updateMediaSessionPositionState()
    }

    // for safari, we only want to seek if we haven't skipped
    if (
      (!isTrackDifferent || !this.isSafari) &&
      (startTime > 0 || this.state.currentTime > 0)
    ) {
      this.seekTo(startTime)
    }

    this.audioElement.playbackRate = this.state.playbackRate

    if (isTrackDifferent && wasPlaying) {
      await this.play()
    }
  }

  async skipToNext(startTime: number = 0) {
    console.log("skipToNext", this.state.trackIndex)
    const nextIndex =
      this.state.trackIndex === this.playlist.length - 1
        ? 0
        : this.state.trackIndex + 1
    await this.skip(nextIndex, startTime)
  }

  async skipToPrevious(startTime: number = 0) {
    if (this.audioElement && this.audioElement.currentTime > this.startMargin) {
      this.seekTo(0)
      return
    }

    const prevIndex =
      this.state.trackIndex === 0
        ? this.playlist.length - 1
        : this.state.trackIndex - 1
    await this.skip(prevIndex, startTime)
  }

  async replacePlaylist(
    tracks: AudioTrack[],
    trackIndex: number = 0,
    start: number = 0,
  ) {
    this.playlist = tracks
    if (tracks.length > 0) {
      await this.skip(trackIndex, start)
      this.updateMediaSessionMetadata()
    }
  }

  getQueue() {
    return [...this.playlist]
  }

  getActiveTrack() {
    return this.playlist[this.state.trackIndex] || null
  }

  getProgress() {
    return {
      position: this.state.currentTime,
      duration: this.state.duration,
      buffered: this.state.buffered,
    }
  }

  getState() {
    return { ...this.state }
  }

  setRepeat(mode: RepeatMode) {
    this.updateState({ repeat: mode })
  }

  toggleMuted() {
    this.updateState({ muted: !this.state.muted })
  }

  clearError() {
    this.updateState({ error: null, retryCount: 0 })
  }

  setUpdateInterval(interval: number) {
    this.updateState({ updateInterval: interval })
  }

  destroy() {
    this.listeners.clear()
  }
}

export const AudioPlayer = new AudioPlayerService()
