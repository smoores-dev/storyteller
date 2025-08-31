import { BookWithRelations } from "@/database/books"

export interface Shelves {
  currentlyReading: BookWithRelations[]
  nextUp: BookWithRelations[]
  recentlyAdded: BookWithRelations[]
  startReading: BookWithRelations[]
}
