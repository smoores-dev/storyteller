"use client"

import { useLocale } from "next-intl"
import { useRef } from "react"
import { useWatch } from "react-hook-form"

import { cn } from "@/cn"

import { SEAMLESS_BOX } from "./BookDetails/EditableText"
import { InlineFieldChrome } from "./BookDetails/InlineEditChrome"
import { useInlineField } from "./BookDetails/use-inline-field"

type LanguageInfo = {
  displayName: string | null
  maximized: string | null
}

export function describeLanguage(code: string, locale: string): LanguageInfo {
  const trimmed = code.trim()
  if (!trimmed) return { displayName: null, maximized: null }

  try {
    const parsed = new Intl.Locale(trimmed)
    const maximized = parsed.maximize().toString()
    const displayNames = new Intl.DisplayNames([locale], {
      type: "language",
      languageDisplay: "dialect",
    })
    return {
      displayName: displayNames.of(trimmed) ?? null,
      maximized,
    }
  } catch {
    return { displayName: null, maximized: null }
  }
}

export function LanguageEdit() {
  const { form, canEdit, active, inlineMode, size, beginEdit } =
    useInlineField("language")
  const locale = useLocale()

  const language = useWatch({ control: form.control, name: "language" }) ?? ""
  const displayRef = useRef<HTMLButtonElement>(null)

  const info = describeLanguage(language, locale)

  if (!canEdit) {
    return (
      <span
        className={cn("text-sm", !language && "text-muted-foreground italic")}
        title={info.maximized ?? undefined}
      >
        {info.displayName ?? (language || "—")}
      </span>
    )
  }

  if (!active) {
    return (
      <button
        ref={displayRef}
        type="button"
        onClick={() => {
          beginEdit(displayRef.current)
        }}
        className={cn(
          SEAMLESS_BOX,
          "py-0",
          "block w-fit border-transparent text-left text-sm",
          "hover:border-input hover:bg-input/10 cursor-text",
          !language && "text-muted-foreground italic",
        )}
      >
        {info.displayName ?? (language || "Add language")}
      </button>
    )
  }

  const editor = (
    <div className="flex flex-col gap-1">
      <input
        value={language}
        placeholder="e.g. en, pt-BR, zh-Hans"
        onChange={(e) => {
          form.setValue("language", e.target.value, { shouldDirty: true })
        }}
        className={cn(
          "text-sm outline-none",
          inlineMode
            ? // bare inside the floating chrome, which supplies the frame
              "border-input focus-visible:border-ring w-30 border-0 border-b border-dashed bg-transparent px-0 py-0.5"
            : cn(
                SEAMLESS_BOX,
                "border-input bg-input/20 dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/30 w-40 focus-visible:ring-2",
              ),
        )}
      />

      <LanguagePreview language={language} />
    </div>
  )

  if (!inlineMode) return editor

  return (
    <InlineFieldChrome name="language" size={size} inline>
      {editor}
    </InlineFieldChrome>
  )
}

export function LanguagePreview({
  language,
  className,
}: {
  language: string
  className?: string
}) {
  const locale = useLocale()
  const info = describeLanguage(language, locale)

  return (
    <div
      className={cn(
        "text-xs",
        !language.trim() || info.maximized
          ? "text-muted-foreground"
          : "text-destructive",
        className,
      )}
    >
      {!language.trim() ? (
        "No language set"
      ) : info.maximized ? (
        <>
          {info.displayName ?? language.trim()}
          <span className="text-muted-foreground/70">
            {" · "}
            {info.maximized}
          </span>
        </>
      ) : (
        "Not a valid language code"
      )}
    </div>
  )
}
