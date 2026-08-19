"use client"

import { useEffect, useState } from "react"

import { Button } from "@v3/_/components/ui/button"
import { Checkbox } from "@v3/_/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@v3/_/components/ui/dialog"
import { Label } from "@v3/_/components/ui/label"

import { getReferencePathsAction } from "@/actions/getReferencePathsAction"
import { type BookWithRelations } from "@/database/books"

export function DeleteBooksDialog({
  open,
  onOpenChange,
  books,
  onConfirm,
  isLoading = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  books: BookWithRelations[]
  onConfirm: (preventReImport: boolean) => void | Promise<void>
  isLoading?: boolean
}) {
  const [preventReImport, setPreventReImport] = useState(false)
  const [referencePaths, setReferencePaths] = useState<string[]>([])

  const count = books.length

  useEffect(() => {
    if (!open) return

    setPreventReImport(false)

    const candidatePaths = books.flatMap((book) =>
      [
        book.ebook?.filepath,
        book.audiobook?.filepath,
        book.readaloud?.filepath,
      ].filter((p): p is string => Boolean(p)),
    )

    void getReferencePathsAction(candidatePaths).then(setReferencePaths)
  }, [open, books])

  const firstBook = books[0]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {count === 1 ? "Deleting book" : `Deleting ${count} books`}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <p className="text-sm">
            {count === 1 && firstBook ? (
              <>
                Are you sure you want to delete{" "}
                <strong>{firstBook.title}</strong>
                {firstBook.authors[0] && <> by {firstBook.authors[0].name}</>}?
              </>
            ) : (
              <>
                Are you sure you want to delete these <strong>{count}</strong>{" "}
                books?
              </>
            )}
          </p>

          <p className="text-muted-foreground text-sm">
            Files in your assets folder will be deleted. Files in your watch
            folders (reference imports) are left on disk.
          </p>

          {referencePaths.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">
                These files will remain on disk:
              </p>
              <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                {referencePaths.map((path) => (
                  <li key={path}>
                    <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs break-all">
                      {path}
                    </code>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Label className="flex items-center gap-2 text-sm font-normal">
            <Checkbox
              checked={preventReImport}
              onCheckedChange={(checked) => {
                setPreventReImport(checked)
              }}
            />
            {count === 1
              ? "Prevent this book from being re-imported"
              : "Prevent these books from being re-imported"}
          </Label>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              onOpenChange(false)
            }}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => void onConfirm(preventReImport)}
            disabled={isLoading}
          >
            {isLoading ? "..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
