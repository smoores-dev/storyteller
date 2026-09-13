import { cn } from "@v3/_/lib/utils"

import { type AlignmentGrade } from "@/shelves"

const GRADE_VAR: Record<AlignmentGrade, string> = {
  S: "grade-s",
  A: "grade-a",
  B: "grade-b",
  C: "grade-c",
  D: "grade-d",
  F: "grade-f",
}

function styles(
  render: (token: string) => string,
): Record<AlignmentGrade, string> {
  return Object.fromEntries(
    Object.entries(GRADE_VAR).map(([grade, token]) => [grade, render(token)]),
  ) as Record<AlignmentGrade, string>
}

export const GRADE_TEXT = styles((token) => `text-[var(--${token})]`)

export const GRADE_FILL = styles((token) => `bg-[var(--${token})]`)

export const GRADE_STYLES = styles(
  (token) => `bg-[var(--${token}-bg)] text-[var(--${token})]`,
)

export const GRADE_TILE = styles(
  (token) =>
    `border-[var(--${token}-line)] bg-[var(--${token}-bg)] text-[var(--${token})]`,
)

export const GRADE_COLORS: Record<string, string> = styles(
  (token) => `var(--${token})`,
)

function isGrade(grade: string): grade is AlignmentGrade {
  return grade in GRADE_VAR
}

export function GradePill({
  grade,
  className,
}: {
  grade: string
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded px-1 py-px text-[12px] leading-[1.15] font-bold tabular-nums",
        isGrade(grade) ? GRADE_STYLES[grade] : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {grade}
    </span>
  )
}
