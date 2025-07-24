import { BookDetail } from "./BookDetail"

export interface Shelves {
  currentlyReading: BookDetail[]
  nextUp: BookDetail[]
  recentlyAdded: BookDetail[]
  startReading: BookDetail[]
}
