export { processAudiobook } from "./process/processAudiobook.ts"
export { transcribe } from "./transcribe/transcribe.ts"
export { type EmitOptions, emit } from "./emit/emit.ts"
export { markup } from "./markup/markup.ts"
export { align } from "./align/align.ts"
export type {
  AlignOptions,
  AudioFileReport,
  ChapterReport,
  Report,
  UnalignedAudioFileReport,
  UnalignedChapterReport,
  UnalignedNotFoundChapterReport,
} from "./align/align.ts"
export { ctcAlign } from "./align/ctc/align.ts"
export type { AlignOptions as CtcAlignOptions } from "./align/ctc/Aligner.ts"
export {
  REPORT_VERSION,
  type ReportChunkDebug,
  type ReportDebug,
  type ReportSpan,
  type ReportSpineItem,
  type ReportTotals,
  type ReportTrack,
  type ReportTrackSource,
  type ReportV3,
  type SentenceContext,
  type SpanAudio,
  type SpanState,
  type SpanText,
  type SpineStatus,
  assembleReport,
  buildChapterSpans,
  emptyReport,
  emptyTotals,
  spanSeconds,
  spanSentences,
} from "./align/report-v3.ts"
export { type TrackSource, readTrackSource } from "./process/trackSource.ts"
export { upgradeEpub } from "./upgradeEpub/upgradeEpub.ts"
