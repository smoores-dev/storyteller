import { playerPositionUpdated } from "@/store/actions"
import {
  audioPlayerSlice,
  selectAudioPlayerState,
} from "@/store/slices/audioPlayerSlice"
import { type AppStore } from "@/store/store"

import { AudioPlayer, type AudioState } from "./AudioPlayerService"

let store: AppStore | null = null
let unsubscribe: (() => void) | null = null
let previousServiceState: AudioState | null = null
let previousQueueLength = 0

let throttleTimer: ReturnType<typeof setTimeout> | null = null
let pendingChanges: Partial<ReturnType<typeof selectAudioPlayerState>> = {}
let lastPositionUpdateTime = 0
const THROTTLE_DELAY = 50 // ms
const POSITION_UPDATE_THROTTLE = 50 // ms

function hasChanged<T>(prev: T, current: T): boolean {
  if (Array.isArray(prev) && Array.isArray(current)) {
    return prev.length !== current.length || prev !== current
  }
  return prev !== current
}

function flushPendingChanges() {
  if (!store) return

  if (Object.keys(pendingChanges).length > 0) {
    store.dispatch(audioPlayerSlice.actions.setState(pendingChanges))
    pendingChanges = {}
  }

  if (throttleTimer) {
    clearTimeout(throttleTimer)
    throttleTimer = null
  }
}

export function initializeAudioPlayerBridge(appStore: AppStore) {
  store = appStore
  previousServiceState = null
  previousQueueLength = 0
  pendingChanges = {}
  lastPositionUpdateTime = 0

  if (throttleTimer) {
    clearTimeout(throttleTimer)
    throttleTimer = null
  }

  unsubscribe = AudioPlayer.subscribe((audioState) => {
    if (!store) return

    const reduxState = selectAudioPlayerState(store.getState())
    const immediateChanges: Partial<typeof reduxState> = {}
    const deferredChanges: Partial<typeof reduxState> = {}

    if (hasChanged(reduxState.playing, audioState.playing)) {
      immediateChanges.playing = audioState.playing
    }
    if (hasChanged(reduxState.loading, audioState.loading)) {
      immediateChanges.loading = audioState.loading
    }
    if (hasChanged(reduxState.currentTime, audioState.currentTime)) {
      deferredChanges.currentTime = audioState.currentTime
      deferredChanges.timeLeft = audioState.timeLeft
      deferredChanges.progressPercentage = audioState.progressPercentage
    }
    if (hasChanged(reduxState.duration, audioState.duration)) {
      deferredChanges.duration = audioState.duration
    }
    if (hasChanged(reduxState.volume, audioState.volume)) {
      deferredChanges.volume = audioState.volume
    }
    if (hasChanged(reduxState.playbackRate, audioState.playbackRate)) {
      deferredChanges.playbackRate = audioState.playbackRate
    }
    if (hasChanged(reduxState.trackIndex, audioState.trackIndex)) {
      immediateChanges.trackIndex = audioState.trackIndex
    }
    if (hasChanged(reduxState.repeat, audioState.repeat)) {
      immediateChanges.repeat = audioState.repeat
    }
    if (hasChanged(reduxState.error, audioState.error)) {
      immediateChanges.error = audioState.error
    }
    if (hasChanged(reduxState.buffered, audioState.buffered)) {
      deferredChanges.buffered = audioState.buffered
    }
    if (hasChanged(reduxState.stalled, audioState.stalled)) {
      deferredChanges.stalled = audioState.stalled
    }
    if (hasChanged(reduxState.retryCount, audioState.retryCount)) {
      deferredChanges.retryCount = audioState.retryCount
    }
    if (hasChanged(reduxState.start, audioState.start)) {
      deferredChanges.start = audioState.start
    }
    if (hasChanged(reduxState.muted, audioState.muted)) {
      immediateChanges.muted = audioState.muted
    }
    if (hasChanged(reduxState.shuffle, audioState.shuffle)) {
      immediateChanges.shuffle = audioState.shuffle
    }

    const queue = AudioPlayer.getQueue()
    if (
      queue.length !== previousQueueLength ||
      hasChanged(reduxState.trackIndex, audioState.trackIndex)
    ) {
      immediateChanges.playlist = queue
      immediateChanges.currentTrack = queue[audioState.trackIndex] || null
      previousQueueLength = queue.length
    }

    if (Object.keys(immediateChanges).length > 0) {
      flushPendingChanges()
      store.dispatch(audioPlayerSlice.actions.setState(immediateChanges))
    }

    if (Object.keys(deferredChanges).length > 0) {
      pendingChanges = { ...pendingChanges, ...deferredChanges }

      if (!throttleTimer) {
        throttleTimer = setTimeout(() => {
          flushPendingChanges()
        }, THROTTLE_DELAY)
      }
    }

    const now = Date.now()
    if (
      previousServiceState &&
      previousServiceState.currentTime !== audioState.currentTime &&
      audioState.playing &&
      now - lastPositionUpdateTime >= POSITION_UPDATE_THROTTLE
    ) {
      store.dispatch(playerPositionUpdated())
      lastPositionUpdateTime = now
    }

    previousServiceState = { ...audioState }
  })
}

export function destroyAudioPlayerBridge() {
  if (unsubscribe) {
    unsubscribe()
    unsubscribe = null
  }

  if (throttleTimer) {
    clearTimeout(throttleTimer)
    throttleTimer = null
  }

  store = null
  previousServiceState = null
  previousQueueLength = 0
  pendingChanges = {}
  lastPositionUpdateTime = 0
}
