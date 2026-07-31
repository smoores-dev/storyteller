"use client"

import { type PanInfo, motion, useSpring } from "motion/react"
import { type Author } from "next/dist/lib/metadata/types/metadata-types"
import { type ReactNode, useMemo, useRef, useState } from "react"

import { type JsColor } from "@storyteller-platform/okmain"

import { Button } from "@v3/_/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@v3/_/components/ui/dialog"
import { useIsMobile } from "@v3/_/hooks/use-mobile"
import { bookDuration, bookPageCount } from "@v3/_/lib/bookMetrics"
import { useFormatDuration } from "@v3/_/lib/formatters"
import { fitSpine } from "@v3/_/lib/spineFit"

import { TooltipButton } from "@/app/(v3)/v3/_/components/ui/tooltip-button"
import {
  type Audiobook,
  type BookWithRelations,
  type Ebook,
  type Readaloud,
} from "@/database/books"
import * as icon from "@/icons"
import { getCoverUrl } from "@/store/api"
import { type UUID } from "@/uuid"

import { isDualFormat } from "./BookCover"
import { CoverImage } from "./CoverImage"
import { type Swatch, bookCoverSwatches } from "./coverSwatches"

const DPR =
  typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 2) : 2

const THICK_MIN_RATIO = 0.07
const THICK_MAX_RATIO = 0.32

const DURATION_MAX = 108_000 // ~30h in seconds
const PAGES_MAX = 1_000
const FILE_SIZE_MAX = 50_000_000 // 50mb

const PAGE_EDGE_V =
  "repeating-linear-gradient(to right, #f3ecda 0 1px, #d4c4a0 1px 2.5px)"
const PAGE_EDGE_H =
  "repeating-linear-gradient(to bottom, #f3ecda 0 1px, #d4c4a0 1px 2.5px)"
const CD_EDGE_V =
  "linear-gradient(to right, rgba(255,255,255,0.6), rgba(170,176,188,0.35) 45%, rgba(90,96,108,0.5))"
const CD_EDGE_H =
  "linear-gradient(to bottom, rgba(255,255,255,0.6), rgba(170,176,188,0.35) 45%, rgba(90,96,108,0.5))"

const HOURS_PER_DISC = 6
const MAX_DISCS = 6
const CD_BASE_RATIO = 0.11
const CD_PER_DISC_RATIO = 0.03

const SPINE_TITLE_RATIO = 0.072
const SPINE_TITLE_MIN = 10
const SPINE_TITLE_MAX = 22
const SPINE_FONT_SERIF = 'Georgia, "Times New Roman", serif'
const SPINE_FONT_SANS = "ui-sans-serif, system-ui, sans-serif"

export type SpineInfo = "title" | "pages" | "duration"

// which physical rendition a slab represents: the paper book or the cd case
export type Book3DFormat = "ebook" | "audiobook"

export const VIEWS = [
  { y: 0, x: 0, key: "cover" },
  { y: -30, x: 0, key: "pages" },
  { y: 26, x: 8, key: "spine" },
  { y: 180, x: 0, key: "back" },
  { y: 24, x: 0, key: "hover" },
] as const

const SPRING = { stiffness: 140, damping: 18, mass: 0.6 }
const DRAG_SENSITIVITY = 0.4

const AA_EDGE = { outline: "1px solid transparent" } as const

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function publicationYear(book: Book3DBook): number | null {
  if (!book.publicationDate) return null
  const year = new Date(book.publicationDate).getFullYear()
  return Number.isFinite(year) ? year : null
}

function paperMetric(book: Book3DBook): { value: number; max: number } {
  const pages = bookPageCount(book)
  if (pages) return { value: pages, max: PAGES_MAX }

  const fileSize = book.ebook?.fileSize ?? book.readaloud?.fileSize
  if (fileSize) return { value: fileSize, max: FILE_SIZE_MAX }

  const total = bookDuration(book)
  if (total) return { value: total, max: DURATION_MAX }

  return { value: 0.45 * PAGES_MAX, max: PAGES_MAX } // unknown → middling
}

export function getBookThickness(book: Book3DBook, width: number): number {
  const metric = paperMetric(book)
  const norm = clamp(metric.value / metric.max, 0, 1)
  return Math.round(
    width * (THICK_MIN_RATIO + norm * (THICK_MAX_RATIO - THICK_MIN_RATIO)),
  )
}

// how many discs an audiobook holds, for the cd-case depth + the visible stack
function discCount(book: Book3DBook): number {
  const total = bookDuration(book)
  if (!total) return 1
  return clamp(Math.ceil(total / 3600 / HOURS_PER_DISC), 1, MAX_DISCS)
}

function cdThickness(discs: number, width: number): number {
  return Math.round(width * (CD_BASE_RATIO + (discs - 1) * CD_PER_DISC_RATIO))
}

// silver discs floating inside the (clear) jewel case, revealed when it turns
function DiscStack({
  count,
  size,
  thickness,
}: {
  count: number
  size: number
  thickness: number
}) {
  const diameter = Math.round(size * 0.82)
  const inset = 7
  const span = Math.max(0, thickness - inset * 2)

  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const z = count <= 1 ? 0 : -span / 2 + (span / (count - 1)) * i
        return (
          <div
            key={i}
            className="pointer-events-none absolute top-1/2 left-1/2 rounded-full"
            style={{
              width: diameter,
              height: diameter,
              transform: `translate(-50%, -50%) translateZ(${z}px)`,
              background:
                "radial-gradient(circle at 50% 38%, #fdfdfe 4%, #d9dde4 30%, #aeb4bf 46%, #e9ecf1 56%, #b7bdc8 72%, #9097a3 88%)",
              // inset highlight only; a blurred drop shadow on every disc layer
              // repaints expensively inside the 3d transform
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.45)",
            }}
          >
            <div
              className="absolute top-1/2 left-1/2 rounded-full"
              style={{
                width: diameter * 0.17,
                height: diameter * 0.17,
                transform: "translate(-50%, -50%)",
                background: "rgba(255,255,255,0.9)",
                boxShadow: "inset 0 0 0 1px rgba(120,126,138,0.6)",
              }}
            />
          </div>
        )
      })}
    </>
  )
}

function spineLabel(
  book: Book3DBook,
  info: SpineInfo,
  formatDuration: (seconds: number) => string,
): { left: string; right: string } {
  if (info === "pages") {
    const pages = bookPageCount(book)
    return { left: "", right: pages ? `${pages} pages` : "—" }
  }
  if (info === "duration") {
    const total = bookDuration(book)
    return { left: "", right: total ? formatDuration(total) : "—" }
  }
  return {
    left: book.authors.map((author) => author.name).join(", "),
    right: book.title,
  }
}

function CoverFace({
  book,
  audio,
  width,
  height,
}: {
  book: Book3DBook
  audio: boolean
  width: number
  height: number
}) {
  const format = audio ? book.audiobook : book.ebook
  const url = getCoverUrl(book.uuid, {
    width: Math.round(width * DPR),
    height: Math.round(height * DPR),
    audio,
    updatedAt: format?.updatedAt ?? book.updatedAt,
  })

  return (
    <CoverImage
      src={url}
      alt={book.title}
      ariaHidden
      blurhash={format?.coverBlurhash}
      type={audio ? "audiobook" : "ebook"}
      fallbackColors={format?.coverColors}
      className="h-full w-full"
      imgClassName="h-full w-full object-cover"
    />
  )
}

function DescriptionBack({
  book,
  primary,
  width,
}: {
  book: Book3DBook
  primary: Swatch
  width: number
}) {
  const year = publicationYear(book)
  const text = book.description
    ?.replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  const fontSize = clamp(Math.round(width * 0.06), 5, 18)
  const backFontSize = clamp(Math.round(width * 0.03), 3, 13)
  const pad = Math.round(width * 0.07)

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden"
      style={{
        background: primary.css,
        color: primary.onColor,
        padding: pad,
      }}
    >
      {text ? (
        <p
          className="h-full max-h-full text-left font-serif leading-relaxed first-letter:float-left first-letter:mr-[0.1em] first-letter:font-serif first-letter:text-[3.1em] first-letter:leading-[0.72] first-letter:font-semibold"
          aria-hidden
          style={{
            fontSize: backFontSize,
            maskImage: "linear-gradient(to bottom, black 91%, transparent)",
            WebkitMaskImage:
              "linear-gradient(to bottom, black 91%, transparent)",
          }}
        >
          {text}
        </p>
      ) : null}

      {year !== null && (
        <span
          className="absolute font-serif tabular-nums opacity-70"
          style={{
            fontSize: Math.round(fontSize * 0.82),
            right: Math.round(pad * 0.8),
            bottom: Math.round(pad * 0.55),
          }}
        >
          {year}
        </span>
      )}
    </div>
  )
}

type SlabProps = {
  book: Book3DBook
  width: number
  height: number
  thickness: number
  front: ReactNode
  primary: Swatch
  accent: Swatch
  back?: Swatch
  edge: "paper" | "plastic"
  spine: SpineInfo
  interactive: boolean
  discs?: number
  initialView?: number
  onViewChange?: (view: number) => void
  onActivate?: () => void
}

const BASE_WIDTH = 300

function Slab({
  book,
  width,
  height,
  thickness,
  front,
  primary,
  accent,
  back,
  edge,
  spine,
  interactive,
  discs = 0,
  initialView = 0,
  onViewChange,
  onActivate,
}: SlabProps) {
  const half = thickness / 2
  const edgeOffset = (5 * width) / BASE_WIDTH
  const body = back ?? primary
  const spineText = accent === primary ? body.onColor : accent.css
  const formatDuration = useFormatDuration()
  const { left, right } = spineLabel(book, spine, formatDuration)

  // spine type scales with width so it stays proportional across render sizes
  const titleSize = clamp(
    Math.round(width * SPINE_TITLE_RATIO),
    SPINE_TITLE_MIN,
    SPINE_TITLE_MAX,
  )
  const authorSize = Math.max(9, Math.round(titleSize * 0.8))

  const initialAngle = VIEWS[initialView] ?? VIEWS[0]
  const rotateY = useSpring(initialAngle.y, SPRING)
  const rotateX = useSpring(initialAngle.x, SPRING)
  const [view, setView] = useState(initialView)
  const base = useRef({ x: 0, y: 0 })
  const peeking = useRef(false)

  // const [fit, setFit] = useState<SpineFit>({ titleLines: 1, showAuthor: false })
  const fit = useMemo(() => {
    if (spine !== "title") return { titleLines: 1, showAuthor: false }
    return fitSpine({
      title: right,
      author: left,
      length: height - 24,
      thickness,
      titleFont: `${titleSize}px ${SPINE_FONT_SERIF}`,
      authorFont: `${authorSize}px ${SPINE_FONT_SANS}`,
      titleSize,
      authorSize,
    })
  }, [spine, right, left, height, thickness, titleSize, authorSize])
  // useEffect(() => {
  //   if (spine !== "title") return
  //   setFit(
  //     fitSpine({
  //       title: right,
  //       author: left,
  //       length: height - 24,
  //       thickness,
  //       titleFont: `${titleSize}px ${SPINE_FONT_SERIF}`,
  //       authorFont: `${authorSize}px ${SPINE_FONT_SANS}`,
  //       titleSize,
  //       authorSize,
  //     }),
  //   )
  // }, [spine, right, left, height, thickness, titleSize, authorSize])
  // --- end pretext spine fitting ---

  const setViewAngles = (next: number) => {
    const v = VIEWS[next] ?? VIEWS[0]
    rotateY.set(v.y)
    rotateX.set(v.x)
  }

  const handleTap = () => {
    if (!interactive) {
      onActivate?.()
      return
    }
    peeking.current = false
    const next = (view + 1) % VIEWS.length
    setView(next)
    setViewAngles(next)
    onViewChange?.(next)
  }

  const handlePanStart = () => {
    if (!interactive) return
    peeking.current = false
    base.current = { x: rotateY.get(), y: rotateX.get() }
  }

  const handlePan = (_: unknown, info: PanInfo) => {
    if (!interactive) return
    rotateY.set(base.current.x + info.offset.x * DRAG_SENSITIVITY)
    rotateX.set(
      clamp(base.current.y - info.offset.y * DRAG_SENSITIVITY, -45, 45),
    )
  }

  // on release, spring back to the preset view we were on (don't keep the
  // free-dragged angle) — the spring makes this a gentle settle
  const handlePanEnd = () => {
    if (!interactive) return
    setViewAngles(view)
  }

  const handleHoverStart = () => {
    if (!interactive) return
    if (Math.abs(rotateY.get()) < 1 && Math.abs(rotateX.get()) < 1) {
      peeking.current = true
      rotateY.set(24)
    }
  }

  const handleHoverEnd = () => {
    if (peeking.current) {
      peeking.current = false
      rotateY.set(0)
    }
  }

  const edgeV = edge === "plastic" ? CD_EDGE_V : PAGE_EDGE_V
  const edgeH = edge === "plastic" ? CD_EDGE_H : PAGE_EDGE_H

  return (
    <div className="perspective-distant">
      <motion.div
        className="relative shadow-lg transform-3d"
        style={{
          width,
          height,
          rotateX,
          rotateY,
          cursor: interactive ? "grab" : "pointer",
          touchAction: interactive ? "none" : "auto",
        }}
        onTap={handleTap}
        onPanStart={handlePanStart}
        onPan={handlePan}
        onPanEnd={handlePanEnd}
        onHoverStart={handleHoverStart}
        onHoverEnd={handleHoverEnd}
      >
        {/* front cover */}
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-clip rounded-r-xs [&_img]:rounded-none!"
          style={{
            transform: `translateZ(${half}px)`,
            backfaceVisibility: "visible",
            ...AA_EDGE,
          }}
        >
          {front}
          {/* {isAudiobook ? (
            <div
              className="absolute inset-0"
              style={{
                width: `calc(100% + 17px)`,
                insetInlineStart: "-8px",
                insetBlockStart: "-0px",
                backgroundImage: `repeating-linear-gradient(
      to right,
      var(--color-),
      rgba(20, 20, 20, 1) 4%,
      var(--color-tint)  8%
    ),
    linear-gradient(
      to right,
      rgb(15, 15, 15) 1px,
      rgb(31, 31, 31) 2px,
      rgb(41, 41, 41) 3px,
      transparent 11%
    ),
    linear-gradient(
      to right,
      rgb(15, 15, 15),
      rgb(13, 13, 13) 2%,
      rgb(0, 0, 0) 10.4%,
      rgba(255, 255, 255, 0.5) 11%,
      rgba(255, 255, 255, 0.2) 12%,
      rgba(236, 254, 253, 0.03) 100%
    )`,
                backgroundSize: "10% 100%, 100% 100%, 100% 100%",
                backgroundRepeat: "no-repeat, no-repeat, no-repeat",

                boxShadow: `inset 1px 2px 2px 1px rgba(230, 255, 255, 0.13),
      inset 0 0 0 1px rgba(255, 255, 255, 0.2), -4px 2px 20px 0px rgba(0, 0, 0, 0.1),
      -8px 8px 20px 0 rgba(0, 0, 0, 0.2)`,
              }}
            ></div>
          ) : (
            <div
              className="absolute inset-0"
              style={{
                // https://varundhawan.com/blog/2022/01/18/skeuomorphic-book-cover-css
                background: `linear-gradient(to right,
                rgba(0,0,0,0.02) 0%,
                rgba(0,0,0,0.05) 0.75%,
                rgba(255,255,255,0.5) 1.0%,
                rgba(255,255,255,0.6) 1.3%,
                rgba(255,255,255,0.5) 1.4%,
                rgba(255,255,255,0.3) 1.5%,
                rgba(255,255,255,0.3) 2.4%,
                rgba(0,0,0,0.05) 2.7%,
                rgba(0,0,0,0.05) 3.5%,
                rgba(255,255,255,0.3) 4%,
                rgba(255,255,255,0.3) 4.5%,
                rgba(244,244,244,0.1) 5.4%,
                rgba(244,244,244,0.1) 99%,
                rgba(144,144,144,0.2) 100%)`,
                // background: `linear-gradient(to right, rgb(60, 13, 20) 3px, rgba(255, 255, 255, 0.5) 5px, rgba(255, 255, 255, 0.25) 7px, rgba(255, 255, 255, 0.25) 8px, transparent 10px, transparent 12px, transparent 16px, rgba(255, 255, 255, 0.25) 15px, transparent 20px)`,
                boxShadow:
                  "0 0 5px -1px black, inset -1px 1px 2px rgba(255, 255, 255, 0.5)",
              }}
            ></div>
          )}*/}
        </div>

        {/* back: description */}
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-l-xs"
          style={{
            transform: `rotateY(180deg) translateZ(${half}px)`,
            backfaceVisibility: "visible",
            ...AA_EDGE,
          }}
        >
          <DescriptionBack book={book} primary={body} width={width} />
        </div>

        {/* spine */}
        <div
          className="pointer-events-none absolute top-0 h-full overflow-hidden"
          style={{
            width: thickness,
            left: -half,
            transform: "rotateY(-90deg)",
            background: body.css,
            backfaceVisibility: "visible",
            ...AA_EDGE,
          }}
        >
          <div
            className="absolute top-1/2 left-1/2 flex items-center justify-center px-3"
            style={{
              width: height,
              height: thickness,
              transform: "translate(-50%, -50%) rotate(90deg)",
              color: spineText,
            }}
          >
            {spine === "title" ? (
              <div className="flex w-full flex-col items-center justify-center gap-0.5 text-center leading-tight">
                <span
                  className="max-w-full font-serif"
                  style={{
                    fontSize: titleSize,
                    display: "-webkit-box",
                    WebkitLineClamp: String(fit.titleLines),
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {right}
                </span>
                {fit.showAuthor && left && (
                  <span
                    className="max-w-full truncate font-sans uppercase opacity-75"
                    style={{
                      fontSize: authorSize,
                      letterSpacing: "0.04em",
                    }}
                  >
                    {left}
                  </span>
                )}
              </div>
            ) : (
              <span
                className="mx-auto truncate font-serif tabular-nums"
                style={{ fontSize: titleSize }}
              >
                {right}
              </span>
            )}
          </div>
        </div>

        {/* fore-edge (pages) */}
        <div
          className="pointer-events-none absolute"
          style={{
            width: thickness,
            right: -half,
            top: edgeOffset,
            bottom: edgeOffset,
            transform: `rotateY(90deg) translateZ(-${edgeOffset}px)`,
            background: edgeV,
            backfaceVisibility: "hidden",
            ...AA_EDGE,
          }}
        />

        {/* head (top) */}
        <div
          className="pointer-events-none absolute left-0"
          style={{
            height: thickness,
            top: -half,
            right: edgeOffset,
            transform: `rotateX(90deg) translateZ(-${edgeOffset}px)`,
            background: edgeH,
            backfaceVisibility: "hidden",
            ...AA_EDGE,
          }}
        />

        {/* tail (bottom) */}
        <div
          className="pointer-events-none absolute left-0"
          style={{
            height: thickness,
            right: edgeOffset,
            bottom: -half,
            transform: `rotateX(-90deg) translateZ(-${edgeOffset}px)`,
            background: edgeH,
            backfaceVisibility: "hidden",
            ...AA_EDGE,
          }}
        />

        {/* discs floating inside the case, seen as it turns */}
        {edge === "plastic" && discs > 0 && (
          <DiscStack
            count={discs}
            size={Math.min(width, height)}
            thickness={thickness}
          />
        )}
      </motion.div>
    </div>
  )
}

function SlabActions({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-x-0 -bottom-2 z-30 flex translate-y-full justify-center opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
      {children}
    </div>
  )
}

function SingleBookStage({
  book,
  width,
  spine,
  initialViews,
  onViewChange,
  slabActions,
}: {
  book: Book3DBook
  width: number
  spine: SpineInfo
  initialViews?: Partial<Record<Book3DFormat, number>>
  onViewChange?: (view: number, format: Book3DFormat) => void
  slabActions?: (format: Book3DFormat) => ReactNode
}) {
  const colors = bookCoverSwatches(book)
  // the back/spine follow the ebook's own cover, not the resolved primary
  const ebookColors = bookCoverSwatches(book, "ebook")
  const bodyColor = ebookColors.hasColors ? ebookColors.primary : colors.primary
  const audiobookOnly = !!book.audiobook && !book.ebook
  const format: Book3DFormat = audiobookOnly ? "audiobook" : "ebook"

  const height = audiobookOnly ? width : Math.round(width * 1.5)
  const discs = audiobookOnly ? discCount(book) : 0
  const thickness = audiobookOnly
    ? cdThickness(discs, width)
    : getBookThickness(book, width)

  const actions = slabActions?.(format)

  return (
    <div className="relative">
      <Slab
        book={book}
        width={width}
        height={height}
        thickness={thickness}
        primary={colors.primary}
        accent={colors.secondary}
        back={bodyColor}
        edge={audiobookOnly ? "plastic" : "paper"}
        spine={spine}
        interactive
        discs={discs}
        initialView={initialViews?.[format]}
        onViewChange={(view) => onViewChange?.(view, format)}
        front={
          <CoverFace
            book={book}
            audio={audiobookOnly}
            width={width}
            height={height}
          />
        }
      />
      {actions && <SlabActions>{actions}</SlabActions>}
    </div>
  )
}

function DualStage({
  book,
  width,
  spine,
  initialViews,
  onViewChange,
  slabActions,
}: {
  book: Book3DBook
  width: number
  spine: SpineInfo
  initialViews?: Partial<Record<Book3DFormat, number>>
  onViewChange?: (view: number, format: Book3DFormat) => void
  slabActions?: (format: Book3DFormat) => ReactNode
}) {
  // a format without its own extracted colors borrows the book-level swatches
  // (usually the other format's) so its spine/back never fall to app orange
  const bookColors = bookCoverSwatches(book)
  const ebookOwn = bookCoverSwatches(book, "ebook")
  const audioOwn = bookCoverSwatches(book, "audiobook")
  const ebookColors = ebookOwn.hasColors ? ebookOwn : bookColors
  const audioColors = audioOwn.hasColors ? audioOwn : bookColors

  const w = Math.round(width * 0.78)
  const ebookThickness = getBookThickness(book, w)
  const discs = discCount(book)
  const audioThickness = cdThickness(discs, w)

  const slabWrap = (id: Book3DFormat, node: ReactNode) => {
    const actions = slabActions?.(id)
    return (
      <motion.div
        className="relative origin-center"
        style={{ zIndex: 20 }}
        animate={{
          scale: 1,
          opacity: 1,
        }}
        transition={{ type: "spring", stiffness: 200, damping: 24 }}
      >
        {node}
        {actions && <SlabActions>{actions}</SlabActions>}
      </motion.div>
    )
  }

  return (
    <div className="flex items-center justify-center gap-5">
      {slabWrap(
        "ebook",
        <Slab
          book={book}
          width={w}
          height={Math.round(w * 1.5)}
          thickness={ebookThickness}
          primary={ebookColors.primary}
          accent={ebookColors.secondary}
          edge="paper"
          spine={spine}
          interactive={true}
          initialView={initialViews?.ebook}
          onViewChange={(view) => onViewChange?.(view, "ebook")}
          front={
            <CoverFace
              book={book}
              audio={false}
              width={w}
              height={Math.round(w * 1.5)}
            />
          }
        />,
      )}

      {slabWrap(
        "audiobook",
        <Slab
          book={book}
          width={w}
          height={w}
          thickness={audioThickness}
          primary={audioColors.primary}
          accent={audioColors.secondary}
          edge="plastic"
          spine={spine}
          interactive={true}
          discs={discs}
          initialView={initialViews?.audiobook}
          onViewChange={(view) => onViewChange?.(view, "audiobook")}
          front={<CoverFace book={book} audio width={w} height={w} />}
        />,
      )}
    </div>
  )
}

function BookStage({
  book,
  width,
  spine,
  initialViews,
  onViewChange,
  slabActions,
}: {
  book: Book3DBook
  width: number
  spine: SpineInfo
  initialViews?: Partial<Record<Book3DFormat, number>>
  onViewChange?: (view: number, format: Book3DFormat) => void
  slabActions?: (format: Book3DFormat) => ReactNode
}) {
  if (isDualFormat(book as BookWithRelations)) {
    return (
      <DualStage
        book={book}
        width={width}
        spine={spine}
        initialViews={initialViews}
        onViewChange={onViewChange}
        slabActions={slabActions}
      />
    )
  }
  return (
    <SingleBookStage
      book={book}
      width={width}
      spine={spine}
      initialViews={initialViews}
      onViewChange={onViewChange}
      slabActions={slabActions}
    />
  )
}

export type Book3DBook = {
  uuid: UUID
  title: string
  description: string | null
  coverColorsOverride: JsColor[] | null
  authors: Author[]
  pageCount: number | null
  duration: number | null
  readaloud: Pick<
    Readaloud,
    | "coverColors"
    | "status"
    | "coverBlurhash"
    | "pageCount"
    | "duration"
    | "fileSize"
  > | null
  ebook: Pick<
    Ebook,
    "coverColors" | "coverBlurhash" | "pageCount" | "fileSize" | "updatedAt"
  > | null
  audiobook: Pick<
    Audiobook,
    "coverColors" | "coverBlurhash" | "duration" | "fileSize" | "updatedAt"
  > | null
  updatedAt: string
  publicationDate: string | null
}

export function Book3D({
  book,
  width,
  spine = "title",
  initialViews,
  onViewChange,
  actions,
  slabActions,
}: {
  book: Book3DBook
  width: number
  spine?: SpineInfo
  /** preset view index each rendition starts rotated to (see VIEWS) */
  initialViews?: Partial<Record<Book3DFormat, number>>
  /** fires with the new preset index each time a book is tapped to rotate */
  onViewChange?: (view: number, format: Book3DFormat) => void
  actions?: ReactNode
  slabActions?: (format: Book3DFormat) => ReactNode
}) {
  return (
    <div className="group relative w-fit shrink-0 select-none">
      <BookStage
        book={book}
        width={width}
        spine={spine}
        initialViews={initialViews}
        onViewChange={onViewChange}
        slabActions={slabActions}
      />

      {actions && (
        <div className="absolute -right-4 bottom-1 z-30 flex flex-col items-center justify-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
          {actions}
        </div>
      )}
    </div>
  )
}

/**
 * Fullscreen toggle for a book, made to be dropped into `Book3D`'s `actions`.
 */
export function BookFullscreenButton({
  book,
  width,
  spine = "title",
}: {
  book: BookWithRelations
  /** the at-rest render width; the dialog scales up from it */
  width: number
  spine?: SpineInfo
}) {
  const [fullscreen, setFullscreen] = useState(false)
  const isMobile = useIsMobile()

  const fullscreenWidth = Math.round(width * (isMobile ? 2 : 3))

  return (
    <>
      <TooltipButton
        variant="secondary"
        size="icon-sm"
        onClick={() => {
          setFullscreen(true)
        }}
        aria-label="View full screen"
        tooltip="View full screen"
        className="bg-background/85 text-foreground/70 hover:text-foreground rounded-full p-1.5"
      >
        <icon.ArrowsMaximize className="size-3.5 stroke-[1.5]" />
      </TooltipButton>

      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent
          className="flex h-full max-w-[calc(100%-0rem)] items-center justify-center bg-transparent p-10 ring-0 sm:max-w-5xl"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">{book.title}</DialogTitle>
          <BookStage book={book} width={fullscreenWidth} spine={spine} />
          <DialogClose
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="hover:text-foreground text-muted absolute top-2 right-2"
                size="icon-lg"
              />
            }
          >
            <icon.Close />
            <span className="sr-only">Close</span>
          </DialogClose>
        </DialogContent>
      </Dialog>
    </>
  )
}
