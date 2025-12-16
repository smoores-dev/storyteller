import { type PayloadAction, createSlice } from "@reduxjs/toolkit"

// There is obviously no "empty line within import group" here, as there's only
// one line. Seems like a bug.
// eslint-disable-next-line import/order
import {
  type AudioState,
  type AudioTrack,
  type RepeatMode,
} from "@/services/AudioPlayerService"

type AudioPlayerState = AudioState & {
  playlist: AudioTrack[]
  currentTrack: AudioTrack | null
}

const initialState: AudioPlayerState = {
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
  updateInterval: 200,
  start: 0,
  playlist: [],
  currentTrack: null,
}

export const audioPlayerSlice = createSlice({
  name: "audioPlayer",

  initialState,

  reducers: {
    setState: (state, action: PayloadAction<Partial<AudioPlayerState>>) => {
      return { ...state, ...action.payload }
    },

    setPlaying: (state, action: PayloadAction<boolean>) => {
      state.playing = action.payload
    },

    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload
    },

    setCurrentTime: (state, action: PayloadAction<number>) => {
      state.currentTime = action.payload
      if (state.duration > 0) {
        state.progressPercentage = (action.payload / state.duration) * 100
        state.timeLeft = state.duration - action.payload
      }
    },

    setDuration: (state, action: PayloadAction<number>) => {
      state.duration = action.payload
      state.timeLeft = action.payload
    },

    setVolume: (state, action: PayloadAction<number>) => {
      state.volume = action.payload
    },

    setPlaybackRate: (state, action: PayloadAction<number>) => {
      state.playbackRate = action.payload
    },

    setTrackIndex: (state, action: PayloadAction<number>) => {
      state.trackIndex = action.payload
      state.currentTrack = state.playlist[action.payload] || null
    },

    setRepeat: (state, action: PayloadAction<RepeatMode>) => {
      state.repeat = action.payload
    },

    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
    },

    setPlaylist: (
      state,
      action: PayloadAction<{
        tracks: AudioTrack[]
        trackIndex?: number
        start?: number
      }>,
    ) => {
      state.playlist = action.payload.tracks
      state.trackIndex = action.payload.trackIndex ?? 0
      state.start = action.payload.start ?? 0
      state.currentTrack = state.playlist[state.trackIndex] || null
    },

    // clear all state back to initial
    reset: () => initialState,
  },
})

export const audioPlayerReducer = audioPlayerSlice.reducer

import { type RootState } from "@/store/appState"

export const selectAudioPlayerState = (state: RootState) => state.audioPlayer

export const selectIsPlaying = (state: RootState) => state.audioPlayer.playing

export const selectCurrentTime = (state: RootState) =>
  state.audioPlayer.currentTime

export const selectDuration = (state: RootState) => state.audioPlayer.duration

export const selectCurrentTrack = (state: RootState) =>
  state.audioPlayer.currentTrack ?? null

export const selectPlaylist = (state: RootState) => state.audioPlayer.playlist

export const selectTrackIndex = (state: RootState) =>
  state.audioPlayer.trackIndex

export const selectPlaybackRate = (state: RootState) =>
  Math.round(state.audioPlayer.playbackRate * 100) / 100

export const selectVolume = (state: RootState) => state.audioPlayer.volume

export const selectProgressPercentage = (state: RootState) =>
  state.audioPlayer.progressPercentage

export const selectIsLoading = (state: RootState) => state.audioPlayer.loading

export const selectError = (state: RootState) => state.audioPlayer.error ?? null

export const selectBuffered = (state: RootState) => state.audioPlayer.buffered
