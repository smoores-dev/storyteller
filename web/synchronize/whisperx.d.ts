import { PyObject, PyList, PyDict } from "pymport"

type SingleWordSegment = PyDict<{
  word: string
  start?: number
  end?: number
  score?: number
}>

type SingleAlignedSegment = PyDict<{
  start: number
  end: number
  text: string
  words: SingleWordSegment[]
}>

export type TranscriptionResult = PyDict<{
  segments: SingleAlignedSegment[]
}>

export type TranscribeModel = PyObject<{
  transcribe: (
    audio: PyList<number>,
    { batch_size: number },
  ) => TranscriptionResult
}>

export type WhisperX = PyObject<{
  load_model: (
    modelName: string,
    options: {
      device: string
      compute_type: string
      asr_options: { word_timestamps: boolean; initial_prompt: string }
    },
  ) => {
    transcribe: (
      audio: PyList<number>,
      { batchSize: number },
    ) => TranscriptionResult
  }
  load_align_model: ({
    language_code: string,
    device: string,
  }) => [unknown, unknown]
  load_audio: (trackPath: string) => number[]
  align: (
    segments: PyList<SingleAlignedSegment>,
    align_mdel: unknown,
    align_metadata: unknown,
    audio: PyList<number>,
    options: { device: string; return_char_alignments: boolean },
  ) => TranscriptionResult
}>
