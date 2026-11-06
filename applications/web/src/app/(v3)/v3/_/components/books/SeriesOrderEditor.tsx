import {
  DragDropProvider,
  type DragEndEvent,
  type DragOverEvent,
  useDraggable,
  useDroppable,
} from "@dnd-kit/react"
import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react"

import { Input } from "@v3/_/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@v3/_/components/ui/tooltip"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import {
  type Box,
  EXPAND_STEP,
  type SeriesEntry,
  buildBoxes,
  collapseRun,
  expandRun,
  expandsFully,
  isValidSeriesNumber,
  lastUsedNumber,
  shift,
} from "@/app/(v3)/v3/_/components/books/seriesBoxes"
import * as icon from "@/icons"
import { useGetBookQuery } from "@/store/api"
import { type UUID } from "@/uuid"

type DropData =
  | { action: "set"; position: number | null; lastTrailing?: boolean }
  | { action: "expand"; start: number; end: number }

function boxId(position: number | null) {
  return position === null ? "box:none" : `box:${position}`
}

type SeriesOrderEditorProps = {
  entries: SeriesEntry[]
  onEntriesChange: Dispatch<SetStateAction<SeriesEntry[]>>
  // When provided, each book gets a button to take it out of the series
  onRemoveBook?: (bookUuid: UUID) => void
}

// Numbered boxes that books are dragged into to set their series number.
// Remount (e.g. with a `key`) when switching to a different series.
// Consider virtualization in the future to improve dragging for extremely
// long series.
export function SeriesOrderEditor({
  entries,
  onEntriesChange,
  onRemoveBook,
}: SeriesOrderEditorProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [extraTrailing, setExtraTrailing] = useState(0)
  // Numbers the user revealed inside collapsed runs
  const [expandedNumbers, setExpandedNumbers] = useState<Set<number>>(new Set())

  const last = lastUsedNumber(entries)
  const boxes = buildBoxes(
    entries,
    isDragging ? 1 + extraTrailing : 0,
    expandedNumbers,
  )

  const setPosition = (bookUuid: UUID, position: number | null) => {
    onEntriesChange((prev) =>
      prev.map((entry) =>
        entry.bookUuid === bookUuid ? { ...entry, position } : entry,
      ),
    )
  }

  // Opens an empty box at `position` by moving it and everything after down one
  const insertBox = (position: number) => {
    onEntriesChange((prev) =>
      prev.map((entry) =>
        entry.position !== null && entry.position >= position
          ? { ...entry, position: shift(entry.position, 1) }
          : entry,
      ),
    )
  }

  // Closes an empty box by moving everything after it up one
  const removeBox = (position: number) => {
    onEntriesChange((prev) =>
      prev.map((entry) =>
        entry.position !== null && entry.position > position
          ? { ...entry, position: shift(entry.position, -1) }
          : entry,
      ),
    )
  }

  const handleExpand = (start: number, end: number) => {
    setExpandedNumbers((prev) => expandRun(prev, start, end))
  }

  const handleCollapse = (start: number, end: number) => {
    setExpandedNumbers((prev) => collapseRun(prev, start, end))
  }

  const handleDragOver = (event: DragOverEvent) => {
    const data = event.operation.target?.data as DropData | undefined
    if (data?.action === "expand") {
      handleExpand(data.start, data.end)
    } else if (data?.action === "set" && data.lastTrailing) {
      // Hovering the last trailing box reveals another one after it
      setExtraTrailing((n) => (data.position === last + 1 + n ? n + 1 : n))
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setIsDragging(false)
    setExtraTrailing(0)
    if (event.canceled) return
    const data = event.operation.target?.data as DropData | undefined
    const source = event.operation.source
    if (data?.action !== "set" || !source) return
    setPosition(source.id as UUID, data.position)
  }

  const boxActions: BoxActions = {
    onInsert: insertBox,
    onRemove: removeBox,
    onCollapse: handleCollapse,
    onPositionChange: setPosition,
    onRemoveBook,
  }

  return (
    <DragDropProvider
      onDragStart={() => {
        setIsDragging(true)
      }}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      {/* On mobile the dialog is a drawer, which would otherwise be dragged
          along with the book */}
      {/* Numbered rows share these columns, so the number column fits the
          widest number and every row's books line up */}
      <div
        data-vaul-no-drag
        className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2 gap-y-1"
      >
        {boxes.map((box) =>
          box.kind === "collapsed" ? (
            <CollapsedRun
              key={`run:${box.start}`}
              start={box.start}
              end={box.end}
              onExpand={handleExpand}
            />
          ) : (
            <SeriesBox
              key={boxId(box.kind === "number" ? box.position : null)}
              box={box}
              isLastTrailing={
                box.kind === "number" &&
                box.trailing &&
                box.position === last + 1 + extraTrailing
              }
              {...boxActions}
            />
          ),
        )}
      </div>
    </DragDropProvider>
  )
}

type BoxActions = {
  onInsert: (position: number) => void
  onRemove: (position: number) => void
  onCollapse: (start: number, end: number) => void
  onPositionChange: (bookUuid: UUID, position: number | null) => void
  onRemoveBook: ((bookUuid: UUID) => void) | undefined
}

type SeriesBoxProps = BoxActions & {
  box: Exclude<Box, { kind: "collapsed" }>
  isLastTrailing: boolean
}

function SeriesBox({
  box,
  isLastTrailing,
  onInsert,
  onRemove,
  onCollapse,
  onPositionChange,
  onRemoveBook,
}: SeriesBoxProps) {
  const t = useTranslation("SeriesOrderEditor")
  const position = box.kind === "number" ? box.position : null
  const { ref, isDropTarget } = useDroppable<DropData>({
    id: boxId(position),
    data: { action: "set", position, lastTrailing: isLastTrailing },
  })

  const label = position === null ? t("noNumber") : `#${position}`
  const collapse = box.kind === "number" ? box.collapseRun : null

  return (
    <div
      ref={ref}
      className={cn(
        "col-span-full items-start rounded-md border px-2 py-1",
        // "No number" lays itself out so its wider label doesn't widen the
        // shared number column
        position === null ? "flex gap-2" : "grid grid-cols-subgrid",
        box.entries.length === 0 && "border-dashed",
        isDropTarget && "border-primary bg-primary/5",
      )}
    >
      <span className="text-muted-foreground flex h-8 min-w-10 shrink-0 items-center text-sm whitespace-nowrap tabular-nums">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {box.entries.length === 0 ? (
          <span className="text-muted-foreground/60 flex min-h-8 flex-wrap items-center gap-x-1 text-xs">
            {t("empty")}
            {/* Mirrors the collapsed row's "show", at the run's first
                revealed box */}
            {collapse && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground hover:underline"
                onClick={() => {
                  onCollapse(collapse.start, collapse.end)
                }}
              >
                {t("hideRun", {
                  start: String(collapse.start),
                  end: String(collapse.end),
                })}
              </button>
            )}
          </span>
        ) : (
          box.entries.map((entry) => (
            <SeriesBookChip
              key={entry.bookUuid}
              entry={entry}
              onPositionChange={onPositionChange}
              onRemoveBook={onRemoveBook}
            />
          ))
        )}
      </div>
      {box.kind === "number" && !box.trailing && (
        <div className="flex h-8 shrink-0 items-center gap-0.5">
          <TooltipButton
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            aria-label={t.plain("insertBoxLabel", { box: label })}
            tooltip={t("insertBox")}
            onClick={() => {
              onInsert(box.position)
            }}
          >
            <icon.Plus className="size-3.5" />
          </TooltipButton>
          {box.canRemove && (
            <TooltipButton
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              aria-label={t.plain("removeBoxLabel", { box: label })}
              tooltip={t("removeBox")}
              onClick={() => {
                onRemove(box.position)
              }}
            >
              <icon.Minus className="size-3.5" />
            </TooltipButton>
          )}
        </div>
      )}
    </div>
  )
}

function CollapsedRun({
  start,
  end,
  onExpand,
}: {
  start: number
  end: number
  onExpand: (start: number, end: number) => void
}) {
  const t = useTranslation("SeriesOrderEditor")
  // Dragging over a collapsed run reveals some of its boxes to drop into
  const { ref, isDropTarget } = useDroppable<DropData>({
    id: `run:${start}`,
    data: { action: "expand", start, end },
  })
  const range = { start: String(start), end: String(end) }

  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "text-muted-foreground hover:text-foreground col-span-full rounded-md border border-dashed px-2 py-1 text-left text-xs",
        isDropTarget && "border-primary",
      )}
      onClick={() => {
        onExpand(start, end)
      }}
    >
      {expandsFully(start, end)
        ? t("expandableRun", range)
        : t("expandableRunNext", { ...range, count: String(EXPAND_STEP) })}
    </button>
  )
}

type SeriesBookChipProps = Pick<
  BoxActions,
  "onPositionChange" | "onRemoveBook"
> & {
  entry: SeriesEntry
}

function SeriesBookChip({
  entry,
  onPositionChange,
  onRemoveBook,
}: SeriesBookChipProps) {
  const t = useTranslation("SeriesOrderEditor")
  const { ref, handleRef, isDragging } = useDraggable({ id: entry.bookUuid })
  const { data: book } = useGetBookQuery(
    { uuid: entry.bookUuid },
    { skip: entry.title !== undefined },
  )
  const title = entry.title ?? book?.title ?? ""

  // An empty field clears the number. Text the browser can't parse (e.g. a
  // lone "-") also reads as empty, so it's reverted instead.
  const handleCommit = (input: HTMLInputElement) => {
    const value = input.value.trim()
    const parsed = value ? Number(value) : null
    if (
      input.validity.badInput ||
      (parsed !== null && !isValidSeriesNumber(parsed))
    ) {
      input.value = entry.position === null ? "" : String(entry.position)
      return
    }
    onPositionChange(entry.bookUuid, parsed)
  }

  return (
    <div
      ref={ref}
      className={cn(
        "bg-background flex h-8 items-center gap-2 rounded border px-1",
        isDragging && "opacity-60 shadow-md",
      )}
    >
      <button
        ref={handleRef}
        type="button"
        aria-label={t.plain("moveBook", { title })}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded outline-none focus-visible:ring-2 active:cursor-grabbing"
      >
        <icon.GripVertical className="size-4" />
      </button>
      <BookTitle title={title} />
      {/* Keyboard-friendly alternative to dragging; also the only way to
          enter decimals like 2.5. Remounts when a drag changes the number. */}
      <Input
        key={entry.position ?? "none"}
        type="number"
        step="any"
        inputMode="decimal"
        aria-label={t.plain("bookNumber", { title })}
        placeholder="#"
        className="h-6 w-16 shrink-0 px-1 text-xs"
        defaultValue={entry.position ?? ""}
        onBlur={(event) => {
          handleCommit(event.target)
        }}
        onKeyDown={(event) => {
          // Enter applies the number instead of submitting the whole form
          if (event.key === "Enter") {
            event.preventDefault()
            event.currentTarget.blur()
          }
        }}
      />
      {onRemoveBook && (
        <TooltipButton
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          aria-label={t.plain("removeBookLabel", { title })}
          tooltip={t("removeBook")}
          onClick={() => {
            onRemoveBook(entry.bookUuid)
          }}
        >
          <icon.Close className="size-3" />
        </TooltipButton>
      )}
    </div>
  )
}

// Shows the full title in a tooltip when it's cut off: on hover with a mouse,
// or on tap with a finger until the next tap, scroll or key press
function BookTitle({ title }: { title: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const pointerType = useRef("")
  const [hoverOpen, setHoverOpen] = useState(false)
  const [tapOpen, setTapOpen] = useState(false)

  useEffect(() => {
    if (!tapOpen) return
    const close = (event: Event) => {
      // Tapping the title itself toggles it in its click handler
      if (ref.current?.contains(event.target as Node)) return
      setTapOpen(false)
    }
    const events = ["pointerdown", "scroll", "keydown"]
    for (const type of events) {
      document.addEventListener(type, close, true)
    }
    return () => {
      for (const type of events) {
        document.removeEventListener(type, close, true)
      }
    }
  }, [tapOpen])

  const isCutOff = () => {
    const element = ref.current
    return !!element && element.scrollWidth > element.clientWidth
  }

  return (
    <Tooltip
      open={hoverOpen || tapOpen}
      onOpenChange={(next) => {
        // Browsers fake hover after a tap, which would leave it stuck open
        setHoverOpen(next && pointerType.current !== "touch" && isCutOff())
      }}
    >
      <TooltipTrigger
        render={<span ref={ref} />}
        className="min-w-0 flex-1 truncate text-sm"
        onPointerEnter={(event) => {
          pointerType.current = event.pointerType
        }}
        onPointerDown={(event) => {
          pointerType.current = event.pointerType
        }}
        onClick={() => {
          if (pointerType.current !== "touch") return
          setTapOpen((wasOpen) => !wasOpen && isCutOff())
        }}
      >
        {title}
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  )
}
