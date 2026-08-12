"use client"

import { cn } from "@v3/_/lib/utils"

import { Book3D, VIEWS } from "@/app/(v3)/v3/_/components/books/Book3D"
import {
  type BookCoverImage,
  coverBoxAspect,
  coverBoxStyle,
  coverObjectFitClass,
} from "@/app/(v3)/v3/_/components/books/coverFit"
import { useTranslation } from "@/app/(v3)/v3/_/hooks/use-translation"
import {
  type CoverFit,
  type DoubleCoverAlignment,
  type GridCoverDisplay,
} from "@/database/userPreferencesTypes"
import { type UUID } from "@/uuid"

// the preview has no real art, so it points at an image that will not resolve
// and lets the fallback cover render these colors instead
function previewCoverImage(
  aspect: number,
  colors: BookCoverImage["colors"],
): BookCoverImage {
  return {
    uuid: "00000000-0000-0000-0000-000000000000" as UUID,
    sha256: "preview",
    mimeType: "image/webp",
    width: Math.round(600 * aspect),
    height: 600,
    blurhash: null,
    colors,
  }
}

const ebookGradient = "linear-gradient(150deg, #2563eb, #60a5fa)"
const audioGradient = "linear-gradient(150deg, #7c3aed, #c084fc)"

// landscape art standing in for a cover that is not the usual book shape. the
// ring and the off-centre bar make each mode's distortion or cropping obvious
// at a glance. preserveAspectRatio="none" is what makes stretch actually read
// as a stretch: without it the svg re-fits itself inside the stretched viewport
// and the ring stays a perfect circle no matter the object-fit.
const ART = { width: 125, height: 100 }
const OFF_RATIO_ART = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${ART.width}" height="${ART.height}" viewBox="0 0 ${ART.width} ${ART.height}" preserveAspectRatio="none">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2563eb"/><stop offset="1" stop-color="#60a5fa"/>
    </linearGradient></defs>
    <rect width="${ART.width}" height="${ART.height}" fill="url(#g)"/>
    <circle cx="62.5" cy="46" r="27" fill="none" stroke="#fff" stroke-width="8"/>
    <rect x="34" y="84" width="57" height="7" rx="3.5" fill="#fff" opacity="0.85"/>
  </svg>`,
)}`

// the slot the preview art sits in, matching the aspect-11/16 frame below
const PREVIEW_SLOT_ASPECT = 11 / 16

export function CoverFitPreview({
  fit,
  fill = false,
}: {
  fit: CoverFit
  // a card pinned to one format has no inset box: the art is the whole card
  fill?: boolean
}) {
  return (
    <div
      className={cn(
        "bg-muted flex aspect-11/16 w-28 shrink-0 items-center justify-center rounded-lg",
        !fill && "p-2",
      )}
    >
      <div
        className={cn(
          "relative overflow-hidden shadow-md",
          fill ? "h-full w-full rounded-lg" : "rounded",
        )}
        style={
          fill
            ? undefined
            : coverBoxStyle(
                coverBoxAspect(fit, "ebook", ART),
                PREVIEW_SLOT_ASPECT,
              )
        }
      >
        {fit === "contain" && (
          <img
            src={OFF_RATIO_ART}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full scale-125 object-cover blur-md"
          />
        )}
        <img
          src={OFF_RATIO_ART}
          alt=""
          aria-hidden
          className={cn("relative h-full w-full", coverObjectFitClass(fit))}
        />
      </div>
    </div>
  )
}

function MiniCover({
  variant,
  className,
  style,
}: {
  variant: "ebook" | "audiobook"
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={cn("rounded shadow-md", className)}
      style={{
        background: variant === "ebook" ? ebookGradient : audioGradient,
        ...style,
      }}
    />
  )
}

export function GridCoverPreview({
  display,
  alignment,
}: {
  display: GridCoverDisplay
  alignment: DoubleCoverAlignment
}) {
  const tilted = alignment === "auto"

  return (
    <div className="bg-muted flex aspect-11/16 w-28 shrink-0 items-center justify-center rounded-lg p-2">
      {display === "auto" && (
        <div className="relative flex h-full w-full items-center justify-center">
          <MiniCover
            variant="audiobook"
            className="absolute aspect-square h-1/2"
            style={{
              transform: `translateX(15%) scale(1)${tilted ? " rotate(2.5deg)" : ""}`,
            }}
          />
          <MiniCover
            variant="ebook"
            className="absolute aspect-[2/3] h-[80%]"
            style={{
              transform: `translateX(-10%) scale(1)${tilted ? " rotate(-2.5deg)" : ""}`,
            }}
          />
        </div>
      )}

      {display !== "auto" && (
        <MiniCover
          variant={display}
          className="-m-2 h-[calc(100%+1rem)] w-[calc(100%+1rem)] rounded-lg"
        />
      )}
    </div>
  )
}

export function FlatDetailPreview() {
  return (
    <div className="bg-muted flex aspect-11/16 w-28 shrink-0 items-center justify-center rounded-lg p-2">
      <div className="relative flex h-full w-full items-center justify-center">
        <MiniCover
          variant="audiobook"
          className="absolute aspect-square h-1/2"
          style={{ transform: "translateX(15%) scale(1)" }}
        />
        <MiniCover
          variant="ebook"
          className="absolute aspect-[2/3] h-[80%]"
          style={{ transform: "translateX(-10%) scale(1)" }}
        />
      </div>
    </div>
  )
}

export const VIEW_COUNT = VIEWS.length

export function Book3DPositionPreview({
  ebookView,
  audiobookView,
  onViewChange,
}: {
  ebookView: number
  audiobookView: number
  onViewChange: (view: number, format: "ebook" | "audiobook") => void
}) {
  const t = useTranslation("PreferencesPage.tabs.books.sections.detail")
  return (
    <Book3D
      book={{
        uuid: "xxx" as UUID,
        title: "",
        description: "Hello!",

        coverColorsOverride: null,
        pageCount: null,
        duration: null,
        updatedAt: new Date().toISOString(),
        publicationDate: new Date().toISOString(),
        authors: [],
        readaloud: {
          duration: 24 * 60 * 60,
          fileSize: null,
          pageCount: 500,
          status: "ALIGNED",
          coverImage: previewCoverImage(2 / 3, [
            { r: 94, g: 33, b: 182 },
            { r: 192, g: 132, b: 252 },
          ]),
        },
        ebook: {
          fileSize: null,
          updatedAt: new Date().toISOString(),
          pageCount: 500,
          coverImage: previewCoverImage(2 / 3, [
            { r: 30, g: 64, b: 175 },
            { r: 96, g: 165, b: 250 },
          ]),
        },
        audiobook: {
          duration: 24 * 60 * 60,
          fileSize: null,
          updatedAt: new Date().toISOString(),
          coverImage: previewCoverImage(1, [
            { r: 94, g: 33, b: 182 },
            { r: 192, g: 132, b: 252 },
          ]),
        },
      }}
      width={200}
      spine="title"
      initialViews={{ ebook: ebookView, audiobook: audiobookView }}
      onViewChange={onViewChange}
      slabActions={(format) => (
        <div>
          {t(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            `view.options.${VIEWS[format === "ebook" ? ebookView : audiobookView]!.key}`,
          )}
        </div>
      )}
    />
  )
}
