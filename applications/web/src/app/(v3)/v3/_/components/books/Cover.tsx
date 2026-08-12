"use client"

import { type Variant } from "motion/react"
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"

import { type JsColor } from "@storyteller-platform/okmain"

import { useUserPreferences } from "@/app/(v3)/v3/_/components/user-preferences-provider"
import { useIsMobile } from "@/app/(v3)/v3/_/hooks/use-mobile"
import { cn } from "@/cn"
import { type BookWithRelations } from "@/database/books"
import {
  type CoverFit,
  type GridCoverDisplay,
} from "@/database/userPreferencesTypes"
import * as icon from "@/icons"
import { getImageUrl } from "@/store/api"

import { getBlurhashDataUri } from "./blurhash-data-uri"
import {
  type BookCoverImage,
  type CoverType,
  DEFAULT_SLOT_ASPECT,
  WIDTH_BOUND_SLOT,
  coverBoxAspect,
  coverBoxStyle,
  coverObjectFitClass,
  coverSize,
} from "./coverFit"
import { coverSwatches } from "./coverSwatches"

// potential target for user-configurable override
const ROUNDED_CLASS = "rounded-cover"

export type CoverSettings = {
  deferWhileScrolling: boolean
}

export const DEFAULT_COVER_SETTINGS: CoverSettings = {
  deferWhileScrolling: true,
}

const CoverSettingsContext = createContext<CoverSettings>(
  DEFAULT_COVER_SETTINGS,
)
export const CoverSettingsProvider = CoverSettingsContext.Provider
export function useCoverSettings(): CoverSettings {
  return useContext(CoverSettingsContext)
}

// whether images are allowed to begin their network load
// to disable while scrolling
const CoverLoadContext = createContext(true)
export const CoverLoadProvider = CoverLoadContext.Provider

export function isDual(book: BookWithRelations): boolean {
  const hasReadaloud =
    book.readaloud !== null && book.readaloud.status === "ALIGNED"
  return hasReadaloud || (book.ebook !== null && book.audiobook !== null)
}

// ── tile ────────────────────────────────────────────────────────────────────

function blurhashStyle(
  blurhash: string | null | undefined,
): React.CSSProperties | undefined {
  const uri = getBlurhashDataUri(blurhash)
  return uri
    ? {
        backgroundImage: `url(${uri})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : undefined
}

type TileProps = {
  image: BookCoverImage | null | undefined
  // longest edge to request, in real pixels
  size: number
  // used only for the FallbackCover title; the <img> itself is decorative
  // (alt="") because the card renders the title alongside it.
  alt: string
  type: CoverType
  fit: CoverFit
  // aspect of the space this tile has to fit inside. omit when the caller has
  // already given the tile a box, and it will just fill it.
  slotAspect?: number
  extent?: { width: string; height: string }
  fallbackColors?: JsColor[] | null
  className?: string
  imgClassName?: string
}

export const Tile = memo(function Tile({
  image,
  size,
  alt,
  type,
  fit,
  slotAspect,
  extent,
  fallbackColors,
  className,
  imgClassName,
}: TileProps) {
  const canLoad = useContext(CoverLoadContext)
  // latch: once we've been allowed to load, stay loaded so a later scroll (which
  // flips canLoad back off) never yanks the src and forces a re-decode.
  const [load, setLoad] = useState(canLoad)
  // which image failed, so a different image isn't stuck on the fallback
  const [errored, setErrored] = useState<string | null>(null)

  useEffect(() => {
    if (canLoad) setLoad(true)
  }, [canLoad])

  const boxStyle =
    slotAspect === undefined
      ? undefined
      : coverBoxStyle(coverBoxAspect(fit, type, image), slotAspect, extent)

  if (!image || errored === image.sha256) {
    return (
      <FallbackCover
        title={alt}
        type={type}
        colors={image?.colors ?? fallbackColors}
        style={boxStyle}
        className={cn(ROUNDED_CLASS, className)}
      />
    )
  }

  return (
    <div
      className={cn("relative overflow-hidden", ROUNDED_CLASS, className)}
      style={{ ...blurhashStyle(image.blurhash), ...boxStyle }}
    >
      {load && (
        <img
          key={image.sha256}
          src={getImageUrl(image.sha256, size)}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          onError={() => {
            setErrored(image.sha256)
          }}
          className={cn(
            "h-full w-full",
            ROUNDED_CLASS,
            coverObjectFitClass(fit),
            imgClassName,
          )}
        />
      )}
    </div>
  )
})

export const Cover = memo(function Cover({
  book,
  width = 150,
  interactive = true,
  fit,
  displayMode = "auto",
  slotAspect = DEFAULT_SLOT_ASPECT,
  fill = false,
  className,
}: {
  book: BookWithRelations
  width?: number
  // when false, the double cover renders static (no hover spread)
  interactive?: boolean
  // overrides the user's cover fit preference
  fit?: CoverFit
  // "auto" keeps the double-cover behavior; "ebook"/"audiobook" force a single
  // cover (falling back to whatever format exists if the chosen one is missing)
  displayMode?: GridCoverDisplay
  slotAspect?: number
  // fill the container edge to edge with a single cover instead of sizing a box
  // to the art's own shape. true-size has no meaning here, so it reads as
  // "cover": there is no box left to be true to.
  fill?: boolean
  className?: string
}) {
  const { doubleCoverAlignment, coverFit } = useUserPreferences()
  const requestedFit = fit ?? coverFit
  const resolvedFit =
    fill && requestedFit === "true-size" ? "cover" : requestedFit

  const hoverClass =
    "shadow-sm transition-transform duration-200 hover:translate-y-[-2px] hover:rotate-[-2deg]"

  const textImage = book.ebook?.coverImage ?? book.readaloud?.coverImage
  const audioImage = book.audiobook?.coverImage

  const tile = (type: CoverType) => {
    const image = type === "audiobook" ? audioImage : textImage
    return (
      <Tile
        image={image}
        size={coverSize(width, coverBoxAspect(resolvedFit, type, image))}
        alt={book.title}
        type={type}
        fit={resolvedFit}
        slotAspect={fill ? undefined : slotAspect}
        className={cn(fill ? "h-full w-full" : hoverClass, className)}
        // the art is clipped by the tile, so its own corners have to match
        imgClassName={fill ? className : undefined}
      />
    )
  }

  // the format the user pinned, when it has art of its own to show
  if (displayMode === "ebook" && textImage) return tile("ebook")
  if (displayMode === "audiobook" && audioImage) return tile("audiobook")

  // a filled card is always one tile: falling back to the stack here would make
  // the odd book with a missing cover look like a different display mode
  if (fill) return tile(audioImage && !textImage ? "audiobook" : "ebook")

  if (isDual(book)) {
    return (
      <BookDoubleCover
        book={book}
        width={width}
        fit={resolvedFit}
        slotAspect={slotAspect}
        forceAligned={doubleCoverAlignment === "straight"}
        disableHover={!interactive}
      />
    )
  }

  if (book.audiobook && !book.ebook) return tile("audiobook")

  return tile("ebook")
})

// old double cover

const TILE_CLASS =
  "absolute inset-0 m-auto  shadow-md group-hover/covers:overflow-hidden  "

// fraction of the stack's width a single tile is allowed to take, leaving room
// for the two of them to sit side by side
const STACK_WIDTH = 0.82

type Pos = { x: string; scale: number; z: number; rotateX?: number } & Variant
type CoverState = "idle" | "separated" | "audiobook-front"

const SHUFFLE_MS = 450
const SIMPLE_MS = 220
const PEAK_FRACTION = 0.4

function tx(p: { x: string; scale: number; rotateX?: number }) {
  return `translateX(${p.x}) scale(${p.scale})${p.rotateX ? ` rotate(${p.rotateX}deg)` : ""}`
}

function transformKeyframes(
  target: Pos,
  peak: { x: string; scale: number; rotateX?: number },
  shuffle: boolean,
): Keyframe[] {
  if (!shuffle) return [{ transform: tx(target) }]
  return [
    { offset: PEAK_FRACTION, transform: tx(peak) },
    { offset: 1, transform: tx(target) },
  ]
}

export function BookDoubleCover({
  book,
  width = 300,
  fit = "true-size",
  slotAspect = DEFAULT_SLOT_ASPECT,
  disableHover = false,
  forceAligned,
  onLoadingChange,
}: {
  book: BookWithRelations
  width?: number
  fit?: CoverFit
  slotAspect?: number
  disableHover?: boolean
  forceAligned?: boolean
  onLoadingChange?: (loading: boolean) => void
}) {
  const isMobile = useIsMobile()
  const hoverDisabled = disableHover || isMobile

  const bookIsAligned = book.readaloud?.status === "ALIGNED"
  const isAligned = forceAligned || bookIsAligned

  const STATES: Record<CoverState, { audiobook: Pos; ebook: Pos }> = {
    idle: {
      audiobook: { x: "10%", scale: 1, z: 10, rotateX: isAligned ? 0 : 2.5 },
      ebook: { x: "-10%", scale: 1, z: 20, rotateX: isAligned ? 0 : -2.5 },
    },
    separated: {
      audiobook: { x: "18%", scale: 0.8, z: 10, rotateX: isAligned ? 0 : 2.5 },
      ebook: { x: "-18%", scale: 0.8, z: 20, rotateX: isAligned ? 0 : -2.5 },
    },
    "audiobook-front": {
      audiobook: { x: "5%", scale: 1.05, z: 20, rotateX: isAligned ? 0 : 2.5 },
      ebook: { x: "-15%", scale: 0.9, z: 10, rotateX: isAligned ? 0 : -2.5 },
    },
  }

  const PEAK = {
    audiobook: { x: "48%", scale: 0.85 },
    ebook: { x: "-48%", scale: 0.85 },
  }

  const audiobookRef = useRef<HTMLDivElement>(null)
  const ebookRef = useRef<HTMLDivElement>(null)

  const [audioLoading, _setAudioLoading] = useState(true)
  const [ebookLoading, _setEbookLoading] = useState(true)

  const onLoadingChangeRef = useRef(onLoadingChange)
  onLoadingChangeRef.current = onLoadingChange

  useEffect(() => {
    onLoadingChangeRef.current?.(audioLoading || ebookLoading)
  }, [audioLoading, ebookLoading])

  const stateRef = useRef<CoverState>("idle")
  const audiobookFrontRef = useRef(false)
  const audiobookAnimRef = useRef<Animation | null>(null)
  const ebookAnimRef = useRef<Animation | null>(null)
  const swapTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )

  // apply initial transform/z-index once. we don't set these in JSX style
  // because WAAPI's commitStyles() writes to inline style on interruption,
  // we don't want React to mess with it on rerender
  useEffect(() => {
    const ab = audiobookRef.current
    const eb = ebookRef.current
    if (!ab || !eb) return
    ab.style.transform = tx(STATES.idle.audiobook)
    ab.style.zIndex = String(STATES.idle.audiobook.z)
    eb.style.transform = tx(STATES.idle.ebook)
    eb.style.zIndex = String(STATES.idle.ebook.z)
  }, [])

  const transitionTo = useCallback((target: CoverState) => {
    const ab = audiobookRef.current
    const eb = ebookRef.current
    if (!ab || !eb) return
    if (stateRef.current === target) return

    clearTimeout(swapTimerRef.current)
    swapTimerRef.current = undefined

    try {
      audiobookAnimRef.current?.commitStyles()
    } catch {
      // commitStyles can throw if the animation was already canceled / element detached
    }
    try {
      ebookAnimRef.current?.commitStyles()
    } catch {
      // pass
    }
    audiobookAnimRef.current?.cancel()
    ebookAnimRef.current?.cancel()

    const targetIsFront = target === "audiobook-front"
    const shuffle = targetIsFront !== audiobookFrontRef.current
    const duration = shuffle ? SHUFFLE_MS : SIMPLE_MS

    const tgtAudio = STATES[target].audiobook
    const tgtEbook = STATES[target].ebook

    audiobookAnimRef.current = ab.animate(
      transformKeyframes(tgtAudio, PEAK.audiobook, shuffle),
      { duration, easing: "ease-out", fill: "forwards" },
    )
    ebookAnimRef.current = eb.animate(
      transformKeyframes(tgtEbook, PEAK.ebook, shuffle),
      { duration, easing: "ease-out", fill: "forwards" },
    )

    if (shuffle) {
      // flip z at peak spread, when cards are fully apart and the swap is invisible
      swapTimerRef.current = setTimeout(() => {
        ab.style.zIndex = String(tgtAudio.z)
        eb.style.zIndex = String(tgtEbook.z)
        audiobookFrontRef.current = targetIsFront
        swapTimerRef.current = undefined
      }, duration * PEAK_FRACTION)
    } else {
      ab.style.zIndex = String(tgtAudio.z)
      eb.style.zIndex = String(tgtEbook.z)
    }

    stateRef.current = target
  }, [])

  useEffect(() => {
    return () => {
      clearTimeout(swapTimerRef.current)
      audiobookAnimRef.current?.cancel()
      ebookAnimRef.current?.cancel()
    }
  }, [])

  const textImage = book.ebook?.coverImage ?? book.readaloud?.coverImage
  const audioImage = book.audiobook?.coverImage

  const textAspect = coverBoxAspect(fit, "ebook", textImage)
  const audioAspect = coverBoxAspect(fit, "audiobook", audioImage)

  // the stack is inset from the card, so a tile pins to 82% of the width or
  // the full height, whichever it runs out of first
  const stackExtent = { width: `${STACK_WIDTH * 100}%`, height: "100%" }

  // every tile is absolutely positioned, so a caller that only bounds our width
  // gets a zero-height box unless we work out the height ourselves: the tallest
  // tile is the narrowest one, pinned to STACK_WIDTH of the container.
  const selfSized = slotAspect === WIDTH_BOUND_SLOT

  return (
    <div
      className="group/covers relative h-full w-full"
      style={
        selfSized
          ? {
              height: "auto",
              aspectRatio: `${Math.min(textAspect, audioAspect) / STACK_WIDTH}`,
            }
          : undefined
      }
      onPointerEnter={() => {
        if (hoverDisabled) return
        if (stateRef.current === "idle") transitionTo("separated")
      }}
      onPointerLeave={() => {
        if (hoverDisabled) return
        transitionTo("idle")
      }}
    >
      <div
        ref={audiobookRef}
        className={TILE_CLASS}
        style={coverBoxStyle(audioAspect, slotAspect, stackExtent)}
        onPointerEnter={() => {
          if (hoverDisabled) return
          transitionTo("audiobook-front")
        }}
        onPointerLeave={(e) => {
          if (hoverDisabled) return
          // if we're still inside the cover-stack, fall back to separated
          const next = e.relatedTarget as Node | null
          if (next && e.currentTarget.parentElement?.contains(next)) {
            transitionTo("separated")
          }
        }}
      >
        <Tile
          image={audioImage}
          size={coverSize(width, audioAspect)}
          alt={book.title}
          type="audiobook"
          fit={fit}
          className={cn("h-full w-full", ROUNDED_CLASS)}
        />
      </div>
      <div
        ref={ebookRef}
        className={TILE_CLASS}
        style={coverBoxStyle(textAspect, slotAspect, stackExtent)}
      >
        <Tile
          image={textImage}
          size={coverSize(width, textAspect)}
          alt={book.title}
          type="ebook"
          fit={fit}
          className={cn("h-full w-full", ROUNDED_CLASS)}
        />
      </div>
    </div>
  )
}

export function FallbackCover({
  title,
  type,
  colors,
  className,
  style,
}: {
  title: string
  type: CoverType
  className?: string
  style?: React.CSSProperties
  colors?: JsColor[] | null
}) {
  const { primary, hasColors } = coverSwatches(colors ?? [])
  // a format without its own extracted colors borrows the surrounding cover
  // scope accent (usually the book's other format) instead of the app orange
  const bg = hasColors ? primary.css : "var(--cover-accent)"
  const fg = hasColors ? primary.onColor : "var(--cover-accent-foreground)"

  return (
    <div
      className={cn(
        "from-primary/10 to-primary/5 relative flex h-full w-full flex-col items-center justify-center gap-2 overflow-clip bg-linear-to-br p-4 text-center before:absolute before:inset-0 before:-z-10 before:bg-white before:content-['']",
        className,
      )}
      style={{
        background: bg,
        ...style,
      }}
    >
      {type === "audiobook" ? (
        <icon.HeadphonesFilled className="size-[20%]" style={{ color: fg }} />
      ) : (
        <icon.BookFilled className="size-[20%]" style={{ color: fg }} />
      )}
      <h3
        className="line-clamp-2 max-w-full text-center text-sm font-medium"
        style={{ color: fg }}
      >
        {title}
      </h3>
    </div>
  )
}
