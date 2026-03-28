import { type Readaloud } from "@/database/schema"

export const STAGE_ORDER: Record<Readaloud["currentStage"], number> = {
  SPLIT_TRACKS: 0,
  TRANSCRIBE_CHAPTERS: 1,
  SYNC_CHAPTERS: 2,
}
