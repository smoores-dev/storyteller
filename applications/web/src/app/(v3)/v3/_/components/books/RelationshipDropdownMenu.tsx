"use client"

import { useState } from "react"

import {
  FilterableMenu,
  FilterableMenuContent,
  FilterableMenuItem,
  FilterableMenuTrigger,
} from "@v3/_/components/ui/filterable-menu"
import { Input } from "@v3/_/components/ui/input"
import { Slider } from "@v3/_/components/ui/slider"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { Button } from "@/app/(v3)/v3/_/components/ui/button"
import {
  type RelationItem,
  useRelationItems,
} from "@/app/(v3)/v3/_/hooks/use-relation-items"
import {
  ASSET_FORMATS,
  type AssetFormat,
  type FieldDef,
  type FieldDefDate,
  type FieldDefDuration,
  type FieldDefEnum,
  type FieldDefFacet,
  type FieldDefNumeric,
  getFieldDef,
  getFieldType,
} from "@/fields"
import { FieldIcon } from "@/icons"
import * as icon from "@/icons"
import {
  type ShelfFilterCondition,
  type ShelfFilterField,
  type ShelfFilterOperator,
  shelfValueText,
} from "@/shelves"

import { unitDisplay } from "./filter-ui"
import {
  type RelationRowState,
  RelationSelectList,
} from "./relation-picker/RelationSelectList"

export type FilterChipProps = {
  field: ShelfFilterField
  conditions: ShelfFilterCondition[]
  onChange: (next: ShelfFilterCondition[]) => void
  locked?: boolean
  onRemove?: () => void
}

const ASSET_FORMAT_LABELS: Record<AssetFormat, string> = {
  ebook: "Ebook",
  audiobook: "Audiobook",
  readaloud: "Readaloud",
}

function facetOperators(field: ShelfFilterField): {
  inc: ShelfFilterOperator
  exc: ShelfFilterOperator
} {
  return getFieldType(field) === "array"
    ? { inc: "includes", exc: "excludes" }
    : { inc: "isAnyOf", exc: "isNoneOf" }
}

function readFacet(
  conditions: ShelfFilterCondition[],
  ops: { inc: ShelfFilterOperator; exc: ShelfFilterOperator },
): { inc: string[]; exc: string[] } {
  const find = (op: ShelfFilterOperator) =>
    (conditions.find((c) => c.operator === op)?.value as
      | string[]
      | undefined) ?? []
  return { inc: find(ops.inc), exc: find(ops.exc) }
}

function writeFacet(
  field: ShelfFilterField,
  inc: string[],
  exc: string[],
  ops: { inc: ShelfFilterOperator; exc: ShelfFilterOperator },
  qualifier?: string,
): ShelfFilterCondition[] {
  const out: ShelfFilterCondition[] = []
  const extra = qualifier ? { qualifier } : {}
  if (inc.length)
    out.push({
      type: "condition",
      field,
      operator: ops.inc,
      value: inc,
      ...extra,
    })
  if (exc.length)
    out.push({
      type: "condition",
      field,
      operator: ops.exc,
      value: exc,
      ...extra,
    })
  return out
}

function cycleTriState(
  inc: string[],
  exc: string[],
  uuid: string,
): { inc: string[]; exc: string[] } {
  if (inc.includes(uuid))
    return { inc: inc.filter((x) => x !== uuid), exc: [...exc, uuid] }
  if (exc.includes(uuid)) return { inc, exc: exc.filter((x) => x !== uuid) }
  return { inc: [...inc, uuid], exc }
}

const MAX_SUMMARY_NAMES = 2

function useFacetSummary(
  field: ShelfFilterField,
  def: FieldDef,
  conditions: ShelfFilterCondition[],
): string | null {
  const c = useCommon()
  const isFacet = def.control === "facet"
  const isEnum = def.control === "enum"
  const { inc, exc } =
    isFacet || isEnum
      ? readFacet(conditions, facetOperators(field))
      : { inc: [], exc: [] }
  const active = inc.length + exc.length > 0

  const { items } = useRelationItems(
    isFacet && active ? def.source : undefined,
    isFacet && active,
    field,
  )

  if (!isFacet && !isEnum) return null
  if (!active) return ""

  const nameOf = (value: string): string | null => {
    if (isEnum) return c.plain(`fields.options.${field}.${value}` as never)
    const item = items.find((i) => i.uuid === value)
    if (item) return item.name
    if (isFacet && def.source === "distinct") return value
    return null
  }

  const label = (values: string[], negate: boolean): string | null => {
    const names = values.map(nameOf)
    if (names.some((n) => n === null)) return null
    const shown = names.slice(0, MAX_SUMMARY_NAMES) as string[]
    const rest = names.length - shown.length
    const list = shown.join(", ") + (rest > 0 ? ` +${rest}` : "")
    return negate ? `not ${list}` : list
  }

  const incLabel = inc.length ? label(inc, false) : null
  const excLabel = exc.length ? label(exc, true) : null

  if ((inc.length && !incLabel) || (exc.length && !excLabel)) {
    return ` (${inc.length + exc.length})`
  }

  return `: ${[incLabel, excLabel].filter(Boolean).join(", ")}`
}

function summarize(
  def: FieldDef,
  field: ShelfFilterField,
  conditions: ShelfFilterCondition[],
): string {
  if (def.control === "facet" || def.control === "enum") {
    const { inc, exc } = readFacet(conditions, facetOperators(field))
    const n = inc.length + exc.length
    return n > 0 ? ` (${n})` : ""
  }
  const c = conditions[0]
  if (!c) return ""
  if (def.control === "text") return `: ${shelfValueText(c.value)}`
  // ranges
  if (Array.isArray(c.value)) {
    const [a, b] = c.value as [number | string, number | string]
    return `: ${fmtBound(def, a)}–${fmtBound(def, b)}`
  }
  if (c.operator === "greaterOrEqual" || c.operator === "after")
    return `: ≥ ${fmtBound(def, c.value as number | string)}`
  if (c.operator === "greaterThan")
    return `: > ${fmtBound(def, c.value as number | string)}`
  if (c.operator === "lessOrEqual" || c.operator === "before")
    return `: ≤ ${fmtBound(def, c.value as number | string)}`
  return `: < ${fmtBound(def, c.value as number | string)}`
}

function fmtBound(
  def: FieldDefDate | FieldDefNumeric | FieldDefDuration,
  v: number | string,
): string {
  if (def.control === "date-range") {
    if (def.scale?.unit === "year") return String(v).slice(0, 4)
    return String(v)
  }
  const u = unitDisplay(def.scale?.unit)
  return `${u.to(Number(v))}${u.suffix}`
}

export function FilterChip({
  field,
  conditions,
  onChange,
  locked = false,
  onRemove,
}: FilterChipProps) {
  const def = getFieldDef(field)
  const tLabel = useTranslation("Common.fields.label")
  const [open, setOpen] = useState(false)

  const label = tLabel(def.labelKey as Parameters<typeof tLabel>[0])
  const facetSummary = useFacetSummary(field, def, conditions)
  const summary = facetSummary ?? summarize(def, field, conditions)
  const active = conditions.length > 0

  if (locked) {
    return (
      <span className="border-border bg-muted text-muted-foreground inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium">
        {label}
        {summary}
      </span>
    )
  }

  return (
    <FilterableMenu open={open} onOpenChange={setOpen}>
      <span
        className={cn(
          "inline-flex shrink-0 items-center rounded-full border text-xs font-medium",
          active
            ? "border-primary/30 bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground border-transparent",
        )}
      >
        <FilterableMenuTrigger
          render={
            <button className="flex cursor-pointer items-center gap-1 py-1 pr-1 pl-2.5">
              <FieldIcon field={field} className="h-3 w-3" />
              {label}
              {summary}
            </button>
          }
        />
        {active && onRemove && (
          <button
            aria-label={`Remove ${label} filter`}
            className="hover:text-foreground cursor-pointer py-1 pr-2 pl-1"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
          >
            <icon.Close className="h-3 w-3" />
          </button>
        )}
      </span>
      <FilterableMenuContent
        searchable={def.control === "facet" || def.control === "enum"}
        align="start"
        className="w-72 p-0"
      >
        <FilterEditor
          field={field}
          def={def}
          conditions={conditions}
          onChange={onChange}
          enabled={open}
        />
      </FilterableMenuContent>
    </FilterableMenu>
  )
}

export function FilterEditor({
  field,
  def,
  conditions,
  onChange,
  enabled,
}: {
  field: ShelfFilterField
  def: FieldDef
  conditions: ShelfFilterCondition[]
  onChange: (next: ShelfFilterCondition[]) => void
  enabled: boolean
}) {
  const c = useCommon()
  if (def.control === "facet") {
    return (
      <FacetEditor
        field={field}
        def={def}
        conditions={conditions}
        onChange={onChange}
        enabled={enabled}
      />
    )
  }
  if (def.control === "enum") {
    return (
      <FacetEditor
        field={field}
        def={def}
        conditions={conditions}
        onChange={onChange}
        enabled={enabled}
        staticItems={def.options.map((v) => ({
          uuid: v,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
          name: c.plain(`fields.options.${field}.${v}` as any),
        }))}
      />
    )
  }
  if (def.control === "text") {
    return (
      <TextEditor field={field} conditions={conditions} onChange={onChange} />
    )
  }
  if (def.control === "date-range") {
    return (
      <DateRangeEditor
        field={field}
        def={def}
        conditions={conditions}
        onChange={onChange}
      />
    )
  }
  // number-range / duration-range
  return (
    <NumberRangeEditor
      field={field}
      def={def}
      conditions={conditions}
      onChange={onChange}
    />
  )
}

export function FacetEditor({
  field,
  def,
  conditions,
  onChange,
  enabled,
  staticItems,
}: {
  field: ShelfFilterField
  def: FieldDefFacet | FieldDefEnum
  conditions: ShelfFilterCondition[]
  onChange: (next: ShelfFilterCondition[]) => void
  enabled: boolean
  staticItems?: RelationItem[]
}) {
  const fetched = useRelationItems(
    staticItems ? undefined : (def as FieldDefFacet).source,
    enabled,
    field,
  )
  const items = staticItems ?? fetched.items
  const loading = staticItems ? false : fetched.loading

  const ops = facetOperators(field)
  const { inc, exc } = readFacet(conditions, ops)
  const qualifier = conditions[0]?.qualifier

  const apply = (nextInc: string[], nextExc: string[]) => {
    onChange(writeFacet(field, nextInc, nextExc, ops, qualifier))
  }

  return (
    <RelationSelectList
      items={items}
      loading={loading}
      enabled={enabled}
      stateOf={(item): RelationRowState =>
        inc.includes(item.uuid)
          ? "primary"
          : exc.includes(item.uuid)
            ? "secondary"
            : "none"
      }
      onSelect={(item) => {
        const next = cycleTriState(inc, exc, item.uuid)
        apply(next.inc, next.exc)
      }}
      renderTrailing={(state) =>
        state === "primary" ? (
          <icon.Check className="text-primary h-4 w-4" />
        ) : state === "secondary" ? (
          <icon.Remove className="text-destructive h-4 w-4" />
        ) : null
      }
      footer={
        <div className="border-border flex items-center justify-between border-t p-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              apply(
                items.map((i) => i.uuid),
                [],
              )
            }}
          >
            Select all
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={!inc.length && !exc.length}
            onClick={() => {
              apply([], [])
            }}
          >
            Clear
          </Button>
        </div>
      }
    />
  )
}

function readRange(conditions: ShelfFilterCondition[]): {
  lo: number | null
  hi: number | null
} {
  const c = conditions[0]
  if (!c) return { lo: null, hi: null }
  if (c.operator === "between" && Array.isArray(c.value))
    return { lo: Number(c.value[0]), hi: Number(c.value[1]) }
  if (c.operator === "greaterOrEqual") return { lo: Number(c.value), hi: null }
  if (c.operator === "lessOrEqual") return { lo: null, hi: Number(c.value) }
  return { lo: null, hi: null }
}

function writeRange(
  field: ShelfFilterField,
  lo: number | null,
  hi: number | null,
  format?: AssetFormat,
): ShelfFilterCondition[] {
  const base = {
    type: "condition" as const,
    field,
    ...(format ? { format } : {}),
  }
  if (lo != null && hi != null)
    return [{ ...base, operator: "between", value: [lo, hi] }]
  if (lo != null) return [{ ...base, operator: "greaterOrEqual", value: lo }]
  if (hi != null) return [{ ...base, operator: "lessOrEqual", value: hi }]
  return []
}

function NumberRangeEditor({
  field,
  def,
  conditions,
  onChange,
}: {
  field: ShelfFilterField
  def: FieldDefNumeric | FieldDefDuration
  conditions: ShelfFilterCondition[]
  onChange: (next: ShelfFilterCondition[]) => void
}) {
  const u = unitDisplay(def.scale?.unit)
  const { lo, hi } = readRange(conditions)
  const format = conditions.at(0)?.format

  const set = (nextLo: number | null, nextHi: number | null, fmt = format) => {
    onChange(writeRange(field, nextLo, nextHi, fmt))
  }

  const sliderBounds =
    def.scale && def.scale.min != null && def.scale.max != null
      ? {
          min: def.scale.min,
          max: def.scale.max,
          step: def.scale.step ?? u.step,
        }
      : null
  const dispLo = lo == null ? "" : String(u.to(lo))
  const dispHi = hi == null ? "" : String(u.to(hi))

  const presets = def.options
  const formatChips: (AssetFormat | "any")[] = [
    "any",
    ...(def.formats ?? ASSET_FORMATS),
  ]

  const controls = (
    <div className="flex flex-col gap-3">
      {!!def.formats && (
        <div className="flex flex-wrap gap-1">
          {formatChips.map((f) => {
            const value = f === "any" ? undefined : f
            const selected = format === value
            return (
              <button
                key={f}
                onClick={() => {
                  set(lo, hi, value)
                }}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-xs",
                  selected
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground border-transparent",
                )}
              >
                {f === "any" ? "Any" : ASSET_FORMAT_LABELS[f]}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          placeholder="Min"
          step={u.step}
          value={dispLo}
          onChange={(e) => {
            set(
              e.target.value === "" ? null : u.from(Number(e.target.value)),
              hi,
            )
          }}
          className="h-8"
        />
        <span className="text-muted-foreground text-xs">–</span>
        <Input
          type="number"
          inputMode="decimal"
          placeholder="Max"
          step={u.step}
          value={dispHi}
          onChange={(e) => {
            set(
              lo,
              e.target.value === "" ? null : u.from(Number(e.target.value)),
            )
          }}
          className="h-8"
        />
        {u.suffix && (
          <span className="text-muted-foreground text-xs">{u.suffix}</span>
        )}
      </div>

      {sliderBounds && (
        <Slider
          secondThumb
          thumbAlignment="edge-client-only"
          className="[&_[data-slot='slider-indicator']]:bg-primary/70 [&_[data-slot='slider-thumb']]:border-primary/70"
          min={sliderBounds.min}
          max={sliderBounds.max}
          step={sliderBounds.step}
          defaultValue={[lo ?? sliderBounds.min, hi ?? sliderBounds.max]}
          onValueCommitted={(v) => {
            const arr = (Array.isArray(v) ? v : [v]) as number[]
            set(arr[0] ?? null, arr[1] ?? null)
          }}
        />
      )}
    </div>
  )

  if (presets && presets.length > 0) {
    return (
      <>
        {presets.map((p) => {
          const active = lo === p.min && hi === p.max
          return (
            <FilterableMenuItem
              key={p.label}
              closeOnClick={false}
              textValue={p.label}
              onSelect={() => {
                set(p.min, p.max)
              }}
            >
              <span className="min-w-0 flex-1 truncate">{p.label}</span>
              {active && (
                <icon.Check className="text-primary ml-auto h-4 w-4" />
              )}
            </FilterableMenuItem>
          )
        })}
        <div className="border-t p-3">{controls}</div>
      </>
    )
  }

  return <div className="p-3">{controls}</div>
}

function readDateRange(conditions: ShelfFilterCondition[]): {
  from: string
  to: string
} {
  const c = conditions[0]
  if (!c) return { from: "", to: "" }
  if (c.operator === "between" && Array.isArray(c.value))
    return { from: shelfValueText(c.value[0]), to: shelfValueText(c.value[1]) }
  if (c.operator === "after") return { from: shelfValueText(c.value), to: "" }
  if (c.operator === "before") return { from: "", to: shelfValueText(c.value) }
  return { from: "", to: "" }
}

function writeDateRange(
  field: ShelfFilterField,
  from: string,
  to: string,
): ShelfFilterCondition[] {
  if (!from && !to) return []
  if (from && to)
    return [
      { type: "condition", field, operator: "between", value: [from, to] },
    ]
  if (from)
    return [{ type: "condition", field, operator: "after", value: from }]
  return [{ type: "condition", field, operator: "before", value: to }]
}

type YearMode = "in" | "after" | "before" | "between"

const YEAR_MODE_LABELS: Record<YearMode, string> = {
  in: "In",
  after: "From",
  before: "Until",
  between: "Between",
}

function yearOf(v: string): string {
  return v.slice(0, 4)
}

function readYearState(conditions: ShelfFilterCondition[]): {
  mode: YearMode
  a: string
  b: string
} {
  const c = conditions[0]
  if (!c) return { mode: "in", a: "", b: "" }
  if (c.operator === "between" && Array.isArray(c.value)) {
    const [from, to] = c.value as [string, string]
    const same = yearOf(from) === yearOf(to)
    return same
      ? { mode: "in", a: yearOf(from), b: "" }
      : { mode: "between", a: yearOf(from), b: yearOf(to) }
  }
  if (c.operator === "after")
    return { mode: "after", a: yearOf(shelfValueText(c.value)), b: "" }
  if (c.operator === "before")
    return { mode: "before", a: yearOf(shelfValueText(c.value)), b: "" }
  return { mode: "in", a: "", b: "" }
}

function writeYearState(
  field: ShelfFilterField,
  mode: YearMode,
  a: string,
  b: string,
): ShelfFilterCondition[] {
  const base = { type: "condition" as const, field }
  if (!a) return []
  switch (mode) {
    case "in":
      return [
        { ...base, operator: "between", value: [`${a}-01-01`, `${a}-12-31`] },
      ]
    case "after":
      return [{ ...base, operator: "after", value: `${a}-01-01` }]
    case "before":
      return [{ ...base, operator: "before", value: `${a}-12-31` }]
    case "between":
      if (!b) return [{ ...base, operator: "after", value: `${a}-01-01` }]
      return [
        { ...base, operator: "between", value: [`${a}-01-01`, `${b}-12-31`] },
      ]
  }
}

function YearEditor({
  field,
  conditions,
  onChange,
}: {
  field: ShelfFilterField
  conditions: ShelfFilterCondition[]
  onChange: (next: ShelfFilterCondition[]) => void
}) {
  const { mode, a, b } = readYearState(conditions)

  const set = (nextMode: YearMode, nextA: string, nextB: string) => {
    onChange(writeYearState(field, nextMode, nextA, nextB))
  }

  const sanitize = (raw: string): string | null => {
    if (raw === "") return ""
    if (!/^\d{1,4}$/.test(raw)) return null
    return raw
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap gap-1">
        {(Object.keys(YEAR_MODE_LABELS) as YearMode[]).map((m) => (
          <button
            key={m}
            onClick={() => {
              set(m, a, m === "between" ? b : "")
            }}
            className={cn(
              "rounded-full border px-2 py-0.5 text-xs",
              m === mode
                ? "border-primary/30 bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground border-transparent",
            )}
          >
            {YEAR_MODE_LABELS[m]}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          placeholder="Year"
          min={0}
          max={9999}
          value={a}
          onChange={(e) => {
            const next = sanitize(e.target.value)
            if (next !== null) set(mode, next, b)
          }}
          className="h-8"
        />
        {mode === "between" && (
          <>
            <span className="text-muted-foreground text-xs">–</span>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="Year"
              min={0}
              max={9999}
              value={b}
              onChange={(e) => {
                const next = sanitize(e.target.value)
                if (next !== null) set(mode, a, next)
              }}
              className="h-8"
            />
          </>
        )}
      </div>
    </div>
  )
}

function DateRangeEditor({
  field,
  def,
  conditions,
  onChange,
}: {
  field: ShelfFilterField
  def: FieldDefDate
  conditions: ShelfFilterCondition[]
  onChange: (next: ShelfFilterCondition[]) => void
}) {
  const { from, to } = readDateRange(conditions)
  const presets = def.presets

  if (def.scale?.unit === "year") {
    return (
      <YearEditor field={field} conditions={conditions} onChange={onChange} />
    )
  }

  const applyPreset = (days: number) => {
    const d = new Date()
    d.setDate(d.getDate() - days)
    onChange(writeDateRange(field, d.toISOString().slice(0, 10), ""))
  }

  const controls = (
    <div className="flex items-center gap-2">
      <Input
        type="date"
        value={from}
        onChange={(e) => {
          onChange(writeDateRange(field, e.target.value, to))
        }}
        className="h-8"
      />
      <span className="text-muted-foreground text-xs">–</span>
      <Input
        type="date"
        value={to}
        onChange={(e) => {
          onChange(writeDateRange(field, from, e.target.value))
        }}
        className="h-8"
      />
    </div>
  )

  if (presets && presets.length > 0) {
    return (
      <>
        {presets.map((p) => (
          <FilterableMenuItem
            key={p.label}
            closeOnClick={false}
            textValue={p.label}
            onSelect={() => {
              applyPreset(p.days)
            }}
          >
            <span className="min-w-0 flex-1 truncate">{p.label}</span>
          </FilterableMenuItem>
        ))}
        <div className="border-t p-3">{controls}</div>
      </>
    )
  }

  return <div className="p-3">{controls}</div>
}

function TextEditor({
  field,
  conditions,
  onChange,
}: {
  field: ShelfFilterField
  conditions: ShelfFilterCondition[]
  onChange: (next: ShelfFilterCondition[]) => void
}) {
  const value = shelfValueText(conditions[0]?.value)
  return (
    <div className="p-3">
      <Input
        autoFocus
        value={value}
        placeholder="Contains…"
        onChange={(e) => {
          onChange(
            e.target.value
              ? [
                  {
                    type: "condition",
                    field,
                    operator: "contains",
                    value: e.target.value,
                  },
                ]
              : [],
          )
        }}
        className="h-8"
      />
    </div>
  )
}
