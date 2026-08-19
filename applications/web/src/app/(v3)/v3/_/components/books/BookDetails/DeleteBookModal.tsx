"use client"

import { useRouter } from "next/navigation"
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
import { Separator } from "@v3/_/components/ui/separator"
import { useVersionBasePath } from "@v3/_/components/version-context"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { getReferencePathsAction } from "@/actions/getReferencePathsAction"
import { type BookWithRelations } from "@/database/books"
import { useDeleteBookMutation } from "@/store/api"

export function DeleteBookModal({ book }: { book: BookWithRelations }) {
  const router = useRouter()
  const basePath = useVersionBasePath()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [preventReImport, setPreventReImport] = useState(false)
  const [referencePaths, setReferencePaths] = useState<string[]>([])
  const t = useTranslation("BookDetailsPage")
  const [deleteBook, { isLoading }] = useDeleteBookMutation()

  useEffect(() => {
    if (!showDeleteDialog) return

    const candidatePaths = [
      book.ebook?.filepath,
      book.audiobook?.filepath,
      book.readaloud?.filepath,
    ].filter((p): p is string => Boolean(p))

    void getReferencePathsAction(candidatePaths).then(setReferencePaths)
  }, [showDeleteDialog, book.ebook, book.audiobook, book.readaloud])

  async function handleDelete() {
    await deleteBook({ uuid: book.uuid, preventReImport })
    setShowDeleteDialog(false)
    router.push(`${basePath}/books`)
  }

  return (
    <>
      <Separator className="my-8" />
      <section className="mb-8 flex justify-end px-6">
        <Button
          variant="destructive"
          onClick={() => {
            setShowDeleteDialog(true)
          }}
        >
          {t("deleteBook")}
        </Button>
      </section>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deleting book</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <p className="text-sm">
              Are you sure you want to delete <strong>{book.title}</strong>
              {book.authors[0] && <> by {book.authors[0].name}</>}?
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
                <ul className="flex flex-col gap-1">
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
              Prevent this book from being re-imported
            </Label>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setShowDeleteDialog(false)
              }}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={isLoading}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
