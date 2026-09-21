import React, { useId, useState } from "react"

export interface BenchRow {
  label: string
  value: number
  time?: string
  note?: string
  highlight?: boolean
  estimate?: boolean
}

export interface BenchChartProps {
  title: string
  rows: BenchRow[]
  unit?: string
  caption?: string
  valueHeader?: string
  timeHeader?: string
  initialView?: "chart" | "table"
}

const hair = "border-[var(--ifm-color-emphasis-200)]"
const muted = "text-[var(--ifm-color-emphasis-600)]"
const base = "text-[var(--ifm-font-color-base)]"
const quiet =
  "bg-[color:color-mix(in_oklab,var(--ifm-color-primary)_45%,var(--ifm-background-color))]"
const striped =
  "bg-[image:repeating-linear-gradient(135deg,color-mix(in_oklab,var(--ifm-color-primary)_45%,var(--ifm-background-color))_0_4px,var(--ifm-background-color)_4px_6px)]"
const cell = "px-2 py-1.5 align-top"
const numeric =
  "px-2 py-1.5 align-top text-right tabular-nums whitespace-nowrap"

function formatValue(value: number, unit: string): string {
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10
  return `${rounded.toLocaleString("en-US")}${unit}`
}

const clsx = (...classes: (string | boolean | undefined)[]): string =>
  classes.filter(Boolean).join(" ")

export default function BenchChart({
  title,
  rows,
  unit = "x",
  caption,
  valueHeader = "Speed",
  timeHeader = "Time",
  initialView = "chart",
}: BenchChartProps) {
  const [view, setView] = useState<"chart" | "table">(initialView)
  const id = useId()
  const max = Math.max(...rows.map((row) => row.value))
  const hasTime = rows.some((row) => row.time)
  const hasNote = rows.some((row) => row.note)

  const toggleButton = clsx(
    "cursor-pointer appearance-none border-0 bg-transparent px-2.5 py-[3px] font-[inherit] text-[0.8rem]",
    muted,
    "aria-pressed:bg-[var(--ifm-color-emphasis-100)] aria-pressed:font-semibold aria-pressed:text-[var(--ifm-font-color-base)]",
  )

  return (
    <figure
      className={clsx(
        "mt-6 mb-8 rounded-lg border bg-[var(--ifm-background-color)] px-4 pt-3.5 pb-3 text-[0.9rem]",
        hair,
      )}
      aria-labelledby={`${id}-title`}
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div id={`${id}-title`} className="font-semibold">
          {title}
        </div>
        <div
          className={clsx(
            "inline-flex divide-x overflow-hidden rounded-md border",
            hair,
            "divide-[var(--ifm-color-emphasis-200)]",
          )}
          role="group"
          aria-label="View as"
        >
          <button
            type="button"
            className={toggleButton}
            aria-pressed={view === "chart"}
            onClick={() => setView("chart")}
          >
            Chart
          </button>
          <button
            type="button"
            className={toggleButton}
            aria-pressed={view === "table"}
            onClick={() => setView("table")}
          >
            Table
          </button>
        </div>
      </div>
      {view === "chart" ? (
        <div className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-1 items-center gap-0.5 min-[601px]:grid-cols-[minmax(96px,30%)_1fr] min-[601px]:gap-2.5"
              title={row.note}
            >
              <div
                className={clsx(
                  "text-[0.85rem] leading-tight min-[601px]:text-right min-[601px]:text-[0.9rem]",
                  base,
                )}
              >
                {row.label}
                {row.estimate ? (
                  <span className={clsx("text-[0.75em]", muted)}> est.</span>
                ) : null}
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <div
                  className={clsx(
                    "h-[18px] min-w-[2px] rounded-r transition-[width] duration-300 ease-out",
                    row.estimate
                      ? striped
                      : row.highlight
                        ? "bg-[var(--ifm-color-primary)]"
                        : quiet,
                  )}
                  style={{
                    width: `${((row.value - 0.2 * row.value) / max) * 100}%`,
                  }}
                />
                <div
                  className={clsx(
                    "tabular-nums whitespace-nowrap",
                    base,
                    row.highlight && "font-semibold",
                  )}
                >
                  {formatValue(row.value, unit)}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="m-0 w-full text-[0.85rem]">
            <thead>
              <tr>
                <th className={cell}>Method</th>
                {hasTime ? <th className={numeric}>{timeHeader}</th> : null}
                <th className={numeric}>{valueHeader}</th>
                {hasNote ? <th className={cell}>Notes</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.label}
                  className={row.highlight ? "font-semibold" : undefined}
                >
                  <td className={cell}>
                    {row.label}
                    {row.estimate ? " (estimate)" : ""}
                  </td>
                  {hasTime ? (
                    <td className={numeric}>{row.time ?? ""}</td>
                  ) : null}
                  <td className={numeric}>{formatValue(row.value, unit)}</td>
                  {hasNote ? <td className={cell}>{row.note ?? ""}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {caption ? (
        <figcaption
          className={clsx("mt-2.5 text-[0.8rem] leading-relaxed", muted)}
        >
          {caption}
        </figcaption>
      ) : null}
    </figure>
  )
}
