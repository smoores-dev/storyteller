import { z } from "zod"

import { DEFAULT_RATING_DIMENSIONS } from "./ratingDimensions"

export const ViewKinds = ["grid", "list", "table"] as const

export const ColorModes = ["full", "minimal"] as const
export type ColorMode = (typeof ColorModes)[number]

export const ShellThemes = ["paper", "spine"] as const

export const GridCoverDisplays = ["auto", "ebook", "audiobook"] as const
export type GridCoverDisplay = (typeof GridCoverDisplays)[number]

export const GridCardSizes = [
  "smallest",
  "small",
  "medium",
  "large",
  "largest",
] as const
export type GridCardSize = (typeof GridCardSizes)[number]

export const BookDetailDisplays = ["3d", "cover"] as const

export const DoubleCoverAlignments = ["auto", "straight"] as const
export type DoubleCoverAlignment = (typeof DoubleCoverAlignments)[number]

export const CoverFits = ["true-size", "stretch", "cover", "contain"] as const
export type CoverFit = (typeof CoverFits)[number]

export const RatingIcons = ["star", "heart"] as const

export const BookOpenTargets = ["panel", "page"] as const

export const KindleAddressSchema = z.object({
  name: z.string(),
  email: z.email(),
  default: z.boolean().optional(),
})

export type KindleAddress = z.infer<typeof KindleAddressSchema>

export const UserPreferencesSchema = z.object({
  locale: z.string().nullable(),
  defaultView: z.enum(ViewKinds),
  colorMode: z.enum(ColorModes),
  shellTheme: z.enum(ShellThemes),
  gridCoverDisplay: z.enum(GridCoverDisplays),
  gridCardSize: z.enum(GridCardSizes),
  doubleCoverAlignment: z.enum(DoubleCoverAlignments),
  coverFit: z.enum(CoverFits),
  bookDetailDisplay: z.enum(BookDetailDisplays),
  bookDetail3dView: z.number().int().min(0).nullable(),
  bookDetail3dViewAudio: z.number().int().min(0).nullable(),
  ratingIcon: z.enum(RatingIcons),
  bookOpenTarget: z.enum(BookOpenTargets),
  accentColor: z
    .string()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    .nullable(),
  ratingDimensions: z.array(
    z.object({ id: z.string().min(1), label: z.string() }),
  ),
  defaultStatusUuid: z.string().nullable(),
  layoutAnimations: z.boolean(),
  animatePanelOpen: z.boolean(),
  kindleAddresses: z.array(KindleAddressSchema),
})

export type UserPreferences = z.infer<typeof UserPreferencesSchema>

const NON_NULLABLE_KEYS = [
  "locale",
  "kindleAddresses",
] as const satisfies (keyof UserPreferences)[]

export const UserPreferencesFormSchema = UserPreferencesSchema.extend({
  defaultView: UserPreferencesSchema.shape.defaultView.nullable(),
  colorMode: UserPreferencesSchema.shape.colorMode.nullable(),
  shellTheme: UserPreferencesSchema.shape.shellTheme.nullable(),
  gridCoverDisplay: UserPreferencesSchema.shape.gridCoverDisplay.nullable(),
  gridCardSize: UserPreferencesSchema.shape.gridCardSize.nullable(),
  doubleCoverAlignment:
    UserPreferencesSchema.shape.doubleCoverAlignment.nullable(),
  coverFit: UserPreferencesSchema.shape.coverFit.nullable(),
  bookDetailDisplay: UserPreferencesSchema.shape.bookDetailDisplay.nullable(),
  bookDetail3dView: UserPreferencesSchema.shape.bookDetail3dView.nullable(),
  bookDetail3dViewAudio:
    UserPreferencesSchema.shape.bookDetail3dViewAudio.nullable(),
  ratingIcon: UserPreferencesSchema.shape.ratingIcon.nullable(),
  bookOpenTarget: UserPreferencesSchema.shape.bookOpenTarget.nullable(),
  accentColor: UserPreferencesSchema.shape.accentColor.nullable(),
  ratingDimensions: UserPreferencesSchema.shape.ratingDimensions.nullable(),
  defaultStatusUuid: UserPreferencesSchema.shape.defaultStatusUuid.nullable(),
  layoutAnimations: UserPreferencesSchema.shape.layoutAnimations.nullable(),
  animatePanelOpen: UserPreferencesSchema.shape.animatePanelOpen.nullable(),
} satisfies Record<
  Exclude<keyof UserPreferences, (typeof NON_NULLABLE_KEYS)[number]>,
  // oxlint-disable-next-line typescript/no-explicit-any
  z.ZodNullable<any>
>)

export type UserPreferencesForm = z.infer<typeof UserPreferencesFormSchema>

export const NON_LIBRARY_DEFAULT_KEYS = {
  defaultStatusUuid: true, // null already means "use library default"
  kindleAddresses: true,
} as const satisfies Partial<Record<keyof UserPreferences, true>>

export const PreferenceDefaultsSchema = UserPreferencesSchema.omit(
  NON_LIBRARY_DEFAULT_KEYS,
).partial()

export type PreferenceDefaults = z.infer<typeof PreferenceDefaultsSchema>

export type LibraryDefaultKey = keyof PreferenceDefaults

export const PreferenceDefaultsUpdateSchema = UserPreferencesFormSchema.omit(
  NON_LIBRARY_DEFAULT_KEYS,
).partial()

export type PreferenceDefaultsUpdate = z.infer<
  typeof PreferenceDefaultsUpdateSchema
>

export const LIBRARY_DEFAULT_KEYS = Object.keys(
  PreferenceDefaultsSchema.shape,
) as LibraryDefaultKey[]

export const defaultUserPreferences: UserPreferences = {
  locale: null,
  defaultView: "grid",
  colorMode: "full",
  shellTheme: "paper",
  gridCoverDisplay: "auto",
  gridCardSize: "medium",
  doubleCoverAlignment: "auto",
  coverFit: "true-size",
  bookDetailDisplay: "3d",
  bookDetail3dView: null,
  bookDetail3dViewAudio: null,
  ratingIcon: "star",
  bookOpenTarget: "panel",
  accentColor: null,
  ratingDimensions: DEFAULT_RATING_DIMENSIONS,
  defaultStatusUuid: null,
  layoutAnimations: true,
  animatePanelOpen: true,
  kindleAddresses: [],
}

const LEGACY_COLOR_MODES: Record<string, ColorMode> = {
  colorful: "full",
  subdued: "minimal",
  medium: "full",
}

const LIBRARY_DEFAULT_KEY_SET = new Set<string>(LIBRARY_DEFAULT_KEYS)

function migrateRawPreferences(
  raw: Record<string, unknown> | undefined | null,
): Record<string, unknown> {
  const migrated: Record<string, unknown> = { ...(raw ?? {}) }

  if (typeof migrated["colorMode"] === "string") {
    migrated["colorMode"] =
      LEGACY_COLOR_MODES[migrated["colorMode"]] ?? migrated["colorMode"]
  }

  if (
    !("kindleAddresses" in migrated) &&
    typeof migrated["kindleEmail"] === "string" &&
    migrated["kindleEmail"].trim() !== ""
  ) {
    migrated["kindleAddresses"] = [
      { name: "", email: migrated["kindleEmail"].trim(), default: true },
    ]
  }

  return migrated
}

export function resolveUserPreferences(
  raw: Record<string, unknown> | undefined | null,
  serverDefaults: PreferenceDefaults = {},
): UserPreferences {
  const migrated = migrateRawPreferences(raw)

  const validDefaults = PreferenceDefaultsSchema.safeParse(serverDefaults)
  const resolved: UserPreferences = {
    ...defaultUserPreferences,
    ...(validDefaults.success ? validDefaults.data : {}),
  }

  for (const key of Object.keys(
    UserPreferencesSchema.shape,
  ) as (keyof UserPreferences)[]) {
    if (!(key in migrated)) {
      continue
    }

    const result = UserPreferencesSchema.shape[key].safeParse(migrated[key])
    if (!result.success) {
      continue
    }

    if (LIBRARY_DEFAULT_KEY_SET.has(key) && result.data == null) {
      continue
    }

    resolved[key] = result.data as never
  }

  return resolved
}

export function formUserPreferences(
  raw: Record<string, unknown> | undefined | null,
): UserPreferencesForm {
  const migrated = migrateRawPreferences(raw)

  const result = {} as Record<keyof UserPreferencesForm, unknown>
  for (const key of Object.keys(
    UserPreferencesFormSchema.shape,
  ) as (keyof UserPreferencesForm)[]) {
    const parsed = UserPreferencesFormSchema.shape[key].safeParse(migrated[key])
    result[key] = parsed.success
      ? parsed.data
      : LIBRARY_DEFAULT_KEY_SET.has(key)
        ? null
        : defaultUserPreferences[key]
  }

  return result as UserPreferencesForm
}
