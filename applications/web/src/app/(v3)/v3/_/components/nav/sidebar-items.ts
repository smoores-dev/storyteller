import { type Permission } from "@/database/users"
import * as icon from "@/icons"
import { type StyledIcon } from "@/icons"
import {
  SIDEBAR_BUILTINS,
  type SidebarBuiltinGroup,
  type SidebarBuiltinKey,
} from "@/sidebar-builtins"

export type SidebarGroup = SidebarBuiltinGroup

type AppSidebarLabelKey = "home" | "books" | "alignmentQuality"
type LibraryLabelKey =
  | "Series.plain"
  | "Authors.plain"
  | "Narrators.plain"
  | "Translators.plain"
  | "Tags.plain"
  | "PublicationYear.plain"
  | "Rating.plain"
  | "Status.plain"
  | "Formats.plain"
  | "Identifier.plain"

type BuiltinMetaBase = {
  icon: StyledIcon
  href: string
  countKey?: string
  permission?: Permission
}

type BuiltinMeta =
  | (BuiltinMetaBase & { labelNs: "AppSidebar"; labelKey: AppSidebarLabelKey })
  | (BuiltinMetaBase & { labelNs: "LibraryPage"; labelKey: LibraryLabelKey })

export type BuiltinSidebarItem = BuiltinMeta & {
  key: string
  group: SidebarGroup
}

const BUILTIN_META = {
  home: {
    icon: icon.Home,
    href: "/",
    labelNs: "AppSidebar",
    labelKey: "home",
  },
  books: {
    icon: icon.BookAlt,
    href: "/books",
    countKey: "books",
    labelNs: "AppSidebar",
    labelKey: "books",
  },
  "alignment-quality": {
    icon: icon.ReportAnalytics,
    href: "/quality",
    permission: "bookProcess",
    labelNs: "AppSidebar",
    labelKey: "alignmentQuality",
  },
  series: {
    icon: icon.List,
    href: "/series",
    countKey: "series",
    labelNs: "LibraryPage",
    labelKey: "Series.plain",
  },
  authors: {
    icon: icon.User,
    href: "/authors",
    countKey: "authors",
    labelNs: "LibraryPage",
    labelKey: "Authors.plain",
  },
  narrators: {
    icon: icon.Microphone2,
    href: "/narrators",
    countKey: "narrators",
    labelNs: "LibraryPage",
    labelKey: "Narrators.plain",
  },
  translators: {
    icon: icon.Language,
    href: "/translators",
    countKey: "translators",
    labelNs: "LibraryPage",
    labelKey: "Translators.plain",
  },
  tags: {
    icon: icon.Tag,
    href: "/tags",
    countKey: "tags",
    labelNs: "LibraryPage",
    labelKey: "Tags.plain",
  },
  "publication-years": {
    icon: icon.Calendar,
    href: "/publication-years",
    countKey: "publicationYears",
    labelNs: "LibraryPage",
    labelKey: "PublicationYear.plain",
  },
  ratings: {
    icon: icon.Star,
    href: "/ratings",
    countKey: "ratings",
    labelNs: "LibraryPage",
    labelKey: "Rating.plain",
  },
  statuses: {
    icon: icon.CircleCheck,
    href: "/statuses",
    countKey: "statuses",
    labelNs: "LibraryPage",
    labelKey: "Status.plain",
  },
  formats: {
    icon: icon.Stack,
    href: "/formats",
    labelNs: "LibraryPage",
    labelKey: "Formats.plain",
  },
  identifiers: {
    icon: icon.Link,
    href: "/identifiers",
    countKey: "identifiers",
    labelNs: "LibraryPage",
    labelKey: "Identifier.plain",
  },
} as const satisfies Record<SidebarBuiltinKey, BuiltinMeta>

export const BUILTIN_SIDEBAR_ITEMS: BuiltinSidebarItem[] = SIDEBAR_BUILTINS.map(
  (b) => ({
    key: b.key,
    group: b.group,
    ...BUILTIN_META[b.key],
  }),
)

export const BUILTIN_SIDEBAR_MAP: Record<string, BuiltinSidebarItem> =
  Object.fromEntries(BUILTIN_SIDEBAR_ITEMS.map((item) => [item.key, item]))

export const COLLECTION_ICON = icon.Book
export const SHELF_ICON = icon.Bookmark
