"use client"

import { useState } from "react"

import { DynamicCode } from "@v3/_/components/code/DynamicCode"
import { Button } from "@v3/_/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@v3/_/components/ui/dialog"

import * as icon from "@/icons"
import { useGetBookOpfQuery } from "@/store/api"
import { type UUID } from "@/uuid"

export function ShowOpfDialog({
  bookUuid,
  format,
  formatLabel,
  open,
  onOpenChange,
}: {
  bookUuid: UUID
  format: "ebook" | "readaloud"
  formatLabel: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data, isFetching, error } = useGetBookOpfQuery({ bookUuid, format })
  const [copied, setCopied] = useState(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Package document</DialogTitle>
          <DialogDescription>
            The OPF as stored in the {formatLabel.toLowerCase()}.
          </DialogDescription>
        </DialogHeader>

        {isFetching ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            Reading the file
          </p>
        ) : error ? (
          <p className="text-destructive py-8 text-center text-sm">
            {"status" in error && error.status === 404
              ? "This file has no package document."
              : "Could not read the package document."}
          </p>
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-md border p-3 font-mono text-xs break-words whitespace-pre-wrap">
            <DynamicCode code={data ?? ""} language="xml" />
          </div>
          // <pre
          //   className="bg-muted/30 max-h-[60vh] overflow-auto rounded-md border p-3 font-mono text-xs break-words whitespace-pre-wrap"
          //   dangerouslySetInnerHTML={{ __html: data ?? "" }}
          // >
          //   {/* {data} */}
          // </pre>
        )}

        <DialogFooter>
          {!!data && (
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(data).then(() => {
                  setCopied(true)
                  setTimeout(() => {
                    setCopied(false)
                  }, 1500)
                })
              }}
            >
              {copied ? (
                <icon.Check className="size-3.5" />
              ) : (
                <icon.Copy className="size-3.5" />
              )}
              Copy
            </Button>
          )}

          <Button
            onClick={() => {
              onOpenChange(false)
            }}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
