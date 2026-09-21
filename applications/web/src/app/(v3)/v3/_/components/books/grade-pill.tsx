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

export const GRADE_TEXT = {
  S: "text-(--grade-s)",
  A: "text-(--grade-a)",
  B: "text-(--grade-b)",
  C: "text-(--grade-c)",
  D: "text-(--grade-d)",
  F: "text-(--grade-f)",
} satisfies Record<AlignmentGrade, string>

export const GRADE_FILL = {
  S: "bg-(--grade-s)",
  A: "bg-(--grade-a)",
  B: "bg-(--grade-b)",
  C: "bg-(--grade-c)",
  D: "bg-(--grade-d)",
  F: "bg-(--grade-f)",
} satisfies Record<AlignmentGrade, string>

export const GRADE_STYLES = {
  S: "bg-(--grade-s-bg) text-(--grade-s)",
  A: "bg-(--grade-a-bg) text-(--grade-a)",
  B: "bg-(--grade-b-bg) text-(--grade-b)",
  C: "bg-(--grade-c-bg) text-(--grade-c)",
  D: "bg-(--grade-d-bg) text-(--grade-d)",
  F: "bg-(--grade-f-bg) text-(--grade-f)",
} satisfies Record<AlignmentGrade, string>

export const GRADE_TILE = {
  S: "border-(--grade-s-line) bg-(--grade-s-bg) text-(--grade-s)",
  A: "border-(--grade-a-line) bg-(--grade-a-bg) text-(--grade-a)",
  B: "border-(--grade-b-line) bg-(--grade-b-bg) text-(--grade-b)",
  C: "border-(--grade-c-line) bg-(--grade-c-bg) text-(--grade-c)",
  D: "border-(--grade-d-line) bg-(--grade-d-bg) text-(--grade-d)",
  F: "border-(--grade-f-line) bg-(--grade-f-bg) text-(--grade-f)",
} satisfies Record<AlignmentGrade, string>

export const GRADE_COLORS = {
  S: "var(--grade-s)",
  A: "var(--grade-a)",
  B: "var(--grade-b)",
  C: "var(--grade-c)",
  D: "var(--grade-d)",
  F: "var(--grade-f)",
} satisfies Record<AlignmentGrade, string>

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
