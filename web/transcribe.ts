import { recognize } from "echogarden/dist/api/API"

export async function transcribeTrack(
  trackPath: string,
  initialPrompt: string | null,
  language: string,
) {
  console.log(`Transcribing audio file ${trackPath}`)

  return await recognize(trackPath, {
    engine: "whisper.cpp",
    language,
    whisper: {
      ...(initialPrompt && { prompt: initialPrompt }),
      model: language === "en" ? "tiny.en" : "tiny",
    },
  })
}
