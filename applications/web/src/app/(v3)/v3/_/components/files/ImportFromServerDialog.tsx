"use client"

import { type ReactNode, useState } from "react"

import { ServerFileBrowser } from "@v3/_/components/files/ServerFileBrowser"
import { Button } from "@v3/_/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@v3/_/components/ui/dialog"
import { Label } from "@v3/_/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@v3/_/components/ui/select"

import { type DirectoryFileEntry } from "@/actions/listDirectoryAction"
import {
  type ImportMode,
  type MetadataFieldMode,
} from "@/database/settingsTypes"

export type ImportFromServerDialogLabels = {
  importMode: ReactNode
  importModeReference: string
  importModeCopy: string
  importModeMove: string
  importModeHardlink: string
  metadataBehavior: ReactNode
  metadataMerge: string
  metadataSkip: string
  metadataOverwrite: string
  selected: ReactNode
  cancel: ReactNode
}

type ImportFromServerDialogBaseProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  startPath?: string
  fileFilter?: (entry: { name: string; isDirectory: boolean }) => boolean
  selectLabel?: string
  isSubmitting?: boolean
  submitLabel?: string
  showMetadataMode?: boolean
  warnings?: ReactNode
  error?: string | null
  onSelectionChange?: (path: string) => void
  labels: ImportFromServerDialogLabels
}

type ImportFromServerDialogSingleProps = ImportFromServerDialogBaseProps & {
  multiple?: false
  onSubmit: (
    path: string,
    importMode: ImportMode,
    metadataMode: MetadataFieldMode,
  ) => void | Promise<void>
}

type ImportFromServerDialogMultiProps = ImportFromServerDialogBaseProps & {
  multiple: true
  onSubmit: (
    paths: string[],
    importMode: ImportMode,
    metadataMode: MetadataFieldMode,
  ) => void | Promise<void>
}

export type ImportFromServerDialogProps =
  | ImportFromServerDialogSingleProps
  | ImportFromServerDialogMultiProps

export function ImportFromServerDialog(props: ImportFromServerDialogProps) {
  const {
    open,
    onOpenChange,
    title,
    description,
    startPath,
    fileFilter,
    selectLabel,
    isSubmitting = false,
    submitLabel,
    showMetadataMode = true,
    warnings,
    error,
    onSelectionChange,
    labels,
  } = props

  const [path, setPath] = useState(startPath ?? "")
  const [selectedEntries, setSelectedEntries] = useState<DirectoryFileEntry[]>(
    [],
  )

  const [importMode, setImportMode] = useState<ImportMode>("reference")
  const [metadataMode, setMetadataMode] = useState<MetadataFieldMode>("merge")

  const importModeOptions = [
    { value: "reference" as const, label: labels.importModeReference },
    { value: "copy" as const, label: labels.importModeCopy },
    { value: "move" as const, label: labels.importModeMove },
    { value: "hardlink" as const, label: labels.importModeHardlink },
  ]

  const metadataModeOptions = [
    { value: "merge" as const, label: labels.metadataMerge },
    { value: "skip" as const, label: labels.metadataSkip },
    { value: "always" as const, label: labels.metadataOverwrite },
  ]

  function handlePathChange(newPath: string) {
    setPath(newPath)
    onSelectionChange?.(newPath)
  }

  const hasSelection = props.multiple
    ? selectedEntries.length > 0
    : path.length > 0

  function handleSubmit() {
    if (props.multiple) {
      const paths = selectedEntries.map((e) => e.path)
      if (paths.length === 0) return
      void props.onSubmit(paths, importMode, metadataMode)
    } else {
      if (!path) return
      void props.onSubmit(path, importMode, metadataMode)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85svh] max-h-[85vh] translate-y-0 flex-col sm:top-10 sm:h-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {props.multiple ? (
          <ServerFileBrowser
            multiple
            startPath={startPath}
            fileFilter={fileFilter}
            value={selectedEntries}
            onChange={setSelectedEntries}
            className="min-h-0 flex-1"
          />
        ) : (
          <ServerFileBrowser
            startPath={startPath}
            fileFilter={fileFilter}
            onSelect={handlePathChange}
            selectLabel={selectLabel}
            className="min-h-0 flex-1"
          />
        )}

        {!props.multiple && path && (
          <p className="text-muted-foreground text-xs break-all">
            {labels.selected}: <code className="font-mono">{path}</code>
          </p>
        )}

        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1">
            <Label>{labels.importMode}</Label>
            <Select
              value={importMode}
              onValueChange={(v) => {
                setImportMode(v as ImportMode)
              }}
              items={importModeOptions.map((opt) => ({
                value: opt.value,
                label: opt.label,
              }))}
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {importModeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showMetadataMode && (
            <div className="flex flex-col gap-1">
              <Label>{labels.metadataBehavior}</Label>
              <Select
                value={metadataMode}
                onValueChange={(v) => {
                  setMetadataMode(v as MetadataFieldMode)
                }}
                items={metadataModeOptions.map((opt) => ({
                  value: opt.value,
                  label: opt.label,
                }))}
              >
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {metadataModeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {warnings}

        {error && <p className="text-destructive text-xs">{error}</p>}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              onOpenChange(false)
            }}
            disabled={isSubmitting}
          >
            {labels.cancel}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !hasSelection}
          >
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
