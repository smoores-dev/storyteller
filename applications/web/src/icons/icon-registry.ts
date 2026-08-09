import { z } from "zod";

import { type BookWithRelations } from "@/database/books";
import { type UUID } from "@/uuid";

export type IconEntry = {
  id: string
  tabler: string
  sfSymbol: string
  lucide: string
  tags: string[]
}

export const ICON_REGISTRY: IconEntry[] = [
  // books & reading
  {
    id: "book",
    tabler: "IconBook",
    sfSymbol: "book",
    lucide: "book",
    tags: ["book", "reading", "literature"],
  },
  {
    id: "book-open",
    tabler: "IconBook2",
    sfSymbol: "book.pages",
    lucide: "book-open",
    tags: ["book", "reading", "open"],
  },
  {
    id: "bookmark",
    tabler: "IconBookmark",
    sfSymbol: "bookmark",
    lucide: "bookmark",
    tags: ["bookmark", "save", "mark"],
  },
  {
    id: "library",
    tabler: "IconBooks",
    sfSymbol: "books.vertical",
    lucide: "library",
    tags: ["library", "books", "collection"],
  },
  {
    id: "notebook",
    tabler: "IconNotebook",
    sfSymbol: "note.text",
    lucide: "notebook",
    tags: ["notebook", "notes", "journal"],
  },

  // media
  {
    id: "headphones",
    tabler: "IconHeadphones",
    sfSymbol: "headphones",
    lucide: "headphones",
    tags: ["audio", "headphones", "listen", "music"],
  },
  {
    id: "music",
    tabler: "IconMusic",
    sfSymbol: "music.note",
    lucide: "music",
    tags: ["music", "audio", "song"],
  },
  {
    id: "microphone",
    tabler: "IconMicrophone",
    sfSymbol: "mic",
    lucide: "mic",
    tags: ["microphone", "audio", "podcast", "voice"],
  },
  {
    id: "film",
    tabler: "IconMovie",
    sfSymbol: "film",
    lucide: "film",
    tags: ["film", "movie", "video"],
  },
  {
    id: "camera",
    tabler: "IconCamera",
    sfSymbol: "camera",
    lucide: "camera",
    tags: ["camera", "photo", "picture"],
  },

  // organization
  {
    id: "folder",
    tabler: "IconFolder",
    sfSymbol: "folder",
    lucide: "folder",
    tags: ["folder", "organize", "directory"],
  },
  {
    id: "archive",
    tabler: "IconArchive",
    sfSymbol: "archivebox",
    lucide: "archive",
    tags: ["archive", "storage", "box"],
  },
  {
    id: "tag",
    tabler: "IconTag",
    sfSymbol: "tag",
    lucide: "tag",
    tags: ["tag", "label", "category"],
  },
  {
    id: "list",
    tabler: "IconList",
    sfSymbol: "list.bullet",
    lucide: "list",
    tags: ["list", "items", "bullets"],
  },
  {
    id: "grid",
    tabler: "IconLayoutGrid",
    sfSymbol: "square.grid.2x2",
    lucide: "layout-grid",
    tags: ["grid", "layout", "tiles"],
  },
  {
    id: "layers",
    tabler: "IconStack2",
    sfSymbol: "square.3.layers.3d",
    lucide: "layers",
    tags: ["layers", "stack", "levels"],
  },

  // nature
  {
    id: "leaf",
    tabler: "IconLeaf",
    sfSymbol: "leaf",
    lucide: "leaf",
    tags: ["leaf", "nature", "plant", "eco"],
  },
  {
    id: "tree",
    tabler: "IconTree",
    sfSymbol: "tree",
    lucide: "tree-pine",
    tags: ["tree", "nature", "forest"],
  },
  {
    id: "flower",
    tabler: "IconFlower",
    sfSymbol: "camera.macro",
    lucide: "flower-2",
    tags: ["flower", "nature", "garden"],
  },
  {
    id: "sun",
    tabler: "IconSun",
    sfSymbol: "sun.max",
    lucide: "sun",
    tags: ["sun", "weather", "light", "day"],
  },
  {
    id: "moon",
    tabler: "IconMoon",
    sfSymbol: "moon",
    lucide: "moon",
    tags: ["moon", "night", "dark"],
  },
  {
    id: "cloud",
    tabler: "IconCloud",
    sfSymbol: "cloud",
    lucide: "cloud",
    tags: ["cloud", "weather", "sky"],
  },

  // science & education
  {
    id: "atom",
    tabler: "IconAtom",
    sfSymbol: "atom",
    lucide: "atom",
    tags: ["atom", "science", "physics"],
  },
  {
    id: "flask",
    tabler: "IconFlask",
    sfSymbol: "flask",
    lucide: "flask-conical",
    tags: ["flask", "science", "chemistry", "lab"],
  },
  {
    id: "brain",
    tabler: "IconBrain",
    sfSymbol: "brain",
    lucide: "brain",
    tags: ["brain", "mind", "thinking", "intelligence"],
  },
  {
    id: "graduation",
    tabler: "IconSchool",
    sfSymbol: "graduationcap",
    lucide: "graduation-cap",
    tags: ["graduation", "education", "school", "academic"],
  },
  {
    id: "telescope",
    tabler: "IconTelescope",
    sfSymbol: "scope",
    lucide: "telescope",
    tags: ["telescope", "astronomy", "space", "explore"],
  },

  // art & creativity
  {
    id: "palette",
    tabler: "IconPalette",
    sfSymbol: "paintpalette",
    lucide: "palette",
    tags: ["palette", "art", "paint", "colors"],
  },
  {
    id: "brush",
    tabler: "IconBrush",
    sfSymbol: "paintbrush",
    lucide: "paintbrush",
    tags: ["brush", "art", "paint", "draw"],
  },
  {
    id: "pen",
    tabler: "IconPencil",
    sfSymbol: "pencil",
    lucide: "pencil",
    tags: ["pen", "pencil", "write", "draw"],
  },
  {
    id: "sparkles",
    tabler: "IconSparkles",
    sfSymbol: "sparkles",
    lucide: "sparkles",
    tags: ["sparkles", "magic", "special", "new"],
  },

  // travel & places
  {
    id: "globe",
    tabler: "IconWorld",
    sfSymbol: "globe",
    lucide: "globe",
    tags: ["globe", "world", "earth", "international"],
  },
  {
    id: "map",
    tabler: "IconMap",
    sfSymbol: "map",
    lucide: "map",
    tags: ["map", "navigation", "location", "travel"],
  },
  {
    id: "compass",
    tabler: "IconCompass",
    sfSymbol: "safari",
    lucide: "compass",
    tags: ["compass", "direction", "navigation", "explore"],
  },
  {
    id: "plane",
    tabler: "IconPlane",
    sfSymbol: "airplane",
    lucide: "plane",
    tags: ["plane", "airplane", "travel", "flight"],
  },
  {
    id: "mountain",
    tabler: "IconMountain",
    sfSymbol: "mountain.2",
    lucide: "mountain",
    tags: ["mountain", "nature", "hiking", "adventure"],
  },

  // sports & activity
  {
    id: "running",
    tabler: "IconRun",
    sfSymbol: "figure.run",
    lucide: "footprints",
    tags: ["running", "exercise", "fitness", "sport"],
  },
  {
    id: "trophy",
    tabler: "IconTrophy",
    sfSymbol: "trophy",
    lucide: "trophy",
    tags: ["trophy", "award", "win", "achievement"],
  },
  {
    id: "target",
    tabler: "IconTarget",
    sfSymbol: "target",
    lucide: "target",
    tags: ["target", "goal", "aim", "focus"],
  },
  {
    id: "flame",
    tabler: "IconFlame",
    sfSymbol: "flame",
    lucide: "flame",
    tags: ["flame", "fire", "hot", "trending"],
  },

  // food & drink
  {
    id: "coffee",
    tabler: "IconCoffee",
    sfSymbol: "cup.and.saucer",
    lucide: "coffee",
    tags: ["coffee", "drink", "cafe", "cup"],
  },
  {
    id: "apple",
    tabler: "IconApple",
    sfSymbol: "apple.logo",
    lucide: "apple",
    tags: ["apple", "fruit", "food", "healthy"],
  },
  {
    id: "wine",
    tabler: "IconGlass",
    sfSymbol: "wineglass",
    lucide: "wine",
    tags: ["wine", "drink", "glass", "beverage"],
  },

  // people & social
  {
    id: "user",
    tabler: "IconUser",
    sfSymbol: "person",
    lucide: "user",
    tags: ["user", "person", "profile", "account"],
  },
  {
    id: "users",
    tabler: "IconUsers",
    sfSymbol: "person.2",
    lucide: "users",
    tags: ["users", "people", "group", "team"],
  },
  {
    id: "heart",
    tabler: "IconHeart",
    sfSymbol: "heart",
    lucide: "heart",
    tags: ["heart", "love", "favorite", "like"],
  },
  {
    id: "message",
    tabler: "IconMessage",
    sfSymbol: "message",
    lucide: "message-circle",
    tags: ["message", "chat", "talk", "conversation"],
  },

  // symbols & abstract
  {
    id: "star",
    tabler: "IconStar",
    sfSymbol: "star",
    lucide: "star",
    tags: ["star", "favorite", "rating", "featured"],
  },
  {
    id: "lightning",
    tabler: "IconBolt",
    sfSymbol: "bolt",
    lucide: "zap",
    tags: ["lightning", "bolt", "power", "fast", "energy"],
  },
  {
    id: "shield",
    tabler: "IconShield",
    sfSymbol: "shield",
    lucide: "shield",
    tags: ["shield", "security", "protection", "safe"],
  },
  {
    id: "crown",
    tabler: "IconCrown",
    sfSymbol: "crown",
    lucide: "crown",
    tags: ["crown", "royal", "premium", "king"],
  },
  {
    id: "diamond",
    tabler: "IconDiamond",
    sfSymbol: "diamond",
    lucide: "diamond",
    tags: ["diamond", "gem", "premium", "valuable"],
  },
  {
    id: "infinity",
    tabler: "IconInfinity",
    sfSymbol: "infinity",
    lucide: "infinity",
    tags: ["infinity", "endless", "forever", "loop"],
  },
  {
    id: "clock",
    tabler: "IconClock",
    sfSymbol: "clock",
    lucide: "clock",
    tags: ["clock", "time", "schedule", "history"],
  },
  {
    id: "calendar",
    tabler: "IconCalendar",
    sfSymbol: "calendar",
    lucide: "calendar",
    tags: ["calendar", "date", "schedule", "event"],
  },
]

export const ICON_MAP = Object.fromEntries(
  ICON_REGISTRY.map((entry) => [entry.id, entry]),
) as Record<string, IconEntry>


export const zUuid = z.uuid() as z.ZodType<UUID>
export type Uuid = z.infer<typeof zUuid> 
//           ^? 

export const A = z.object({

}) satisfies z.ZodType<BookWithRelations>