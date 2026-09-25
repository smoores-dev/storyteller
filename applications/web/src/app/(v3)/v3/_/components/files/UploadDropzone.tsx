"use client"

import { type default as Uppy } from "@uppy/core"
import useUppyState from "@uppy/react/lib/useUppyState"
import { useRef, useState } from "react"

import { addFilesToUppy } from "@v3/_/components/files/useTusUpload"
import { cn } from "@v3/_/lib/utils"

import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/app/(v3)/v3/_/components/ui/item"
import * as icon from "@/icons"
import { formatBytes } from "@/strings"

export function UploadDropzone({
  uppy,
  accept,
  multiple,
  disabled,
  label,
  hint,
  filter,
}: {
  uppy: Uppy
  accept?: string
  multiple?: boolean
  disabled?: boolean
  label?: string
  hint?: string
  filter?: (name: string) => boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const filesRecord = useUppyState(uppy, (state) => state.files)
  const allFiles = Object.values(filesRecord)
  const files = filter
    ? allFiles.filter((file) => filter(file.name ?? ""))
    : allFiles

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => {
          setIsDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          if (disabled) return
          addFilesToUppy(uppy, e.dataTransfer.files)
        }}
        className={cn(
          "border-input flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
          isDragging && "border-primary bg-primary/5",
          disabled ? "opacity-50" : "hover:border-primary/50 cursor-pointer",
        )}
      >
        <icon.Upload className="text-muted-foreground h-5 w-5" />
        <span className="text-sm font-medium">
          {label ?? "Drop files here or click to browse"}
        </span>
        {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFilesToUppy(uppy, e.target.files)
            e.target.value = ""
          }}
        />
      </button>

      {files.length > 0 && (
        <ul className="flex max-h-[200px] flex-col gap-1 overflow-y-auto">
          {files.map((file) => {
            const percentage = file.progress.percentage ?? 0
            const isDone = file.progress.uploadComplete

            return (
              <Item
                key={file.id}
                render={<li />}
                className="bg-muted/50 flex min-w-0 items-center gap-2 rounded-md px-3 py-2"
              >
                <ItemMedia variant="icon">
                  <icon.File className="text-muted-foreground h-4 w-4 shrink-0" />
                </ItemMedia>
                <ItemContent className="min-w-0 flex-1 gap-1">
                  <ItemTitle
                    className="block w-full truncate text-sm"
                    title={file.name}
                  >
                    {file.name}
                  </ItemTitle>
                  <ItemDescription className="text-muted-foreground w-full min-w-0 text-xs">
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {formatBytes(file.size ?? 0)}
                    </span>

                    <span className="bg-muted mt-1 block h-1 w-full overflow-hidden rounded-full">
                      <span
                        className={cn(
                          "block h-full rounded-full transition-all",
                          isDone ? "bg-green-600" : "bg-primary",
                        )}
                        style={{ width: `${percentage}%` }}
                      />
                    </span>
                  </ItemDescription>
                </ItemContent>
                {!isDone && (
                  <ItemActions>
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => {
                        uppy.removeFile(file.id)
                      }}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <icon.Close className="h-4 w-4" />
                    </button>
                  </ItemActions>
                )}
              </Item>
            )
          })}
        </ul>
      )}
    </div>
  )
}
