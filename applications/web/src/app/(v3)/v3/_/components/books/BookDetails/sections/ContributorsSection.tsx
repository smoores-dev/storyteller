"use client"

import { Controller, useFieldArray } from "react-hook-form"

import { useBookForm } from "@v3/_/components/books/BookDetails/BookFormProvider"
import { Badge } from "@v3/_/components/ui/badge"
import { Button } from "@v3/_/components/ui/button"
import { Input } from "@v3/_/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@v3/_/components/ui/select"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { creatorRelators } from "@/components/books/edit/marcRelators"
import * as icon from "@/icons"

import { CollapsibleSection } from "./CollapsibleSection"

export function ContributorsSection({ className }: { className?: string }) {
  const { book, isEditing } = useBookForm()
  const tLabels = useTranslation("Labels")

  const nonAuthorNarratorCreators = book.creators.filter(
    (c) => c.role !== "aut" && c.role !== "nrt",
  )

  const isVisible = isEditing || nonAuthorNarratorCreators.length > 0
  if (!isVisible) return null

  return (
    <CollapsibleSection
      title={tLabels("otherContributors")}
      sectionKey="contributors"
      className={className}
    >
      {isEditing ? (
        <ContributorsEditor />
      ) : (
        <div className="flex flex-wrap gap-2">
          {nonAuthorNarratorCreators.map((creator) => (
            <Badge key={creator.uuid} variant="outline">
              {creator.name}
              {creator.role && (
                <span className="text-muted-foreground ml-1">
                  ({creator.role})
                </span>
              )}
            </Badge>
          ))}
        </div>
      )}
    </CollapsibleSection>
  )
}

function ContributorsEditor() {
  const { form } = useBookForm()

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "creators",
  })

  return (
    <div className="flex flex-col gap-3">
      {fields.map((field, idx) => (
        <div key={field.id} className="flex items-center gap-2">
          <Input
            {...form.register(`creators.${idx}.name`)}
            placeholder="Name"
            className="h-8 flex-1 text-sm"
          />

          <Controller
            control={form.control}
            name={`creators.${idx}.role`}
            render={({ field: roleField }) => (
              <Select
                items={creatorRelators}
                value={roleField.value}
                onValueChange={(value) => {
                  roleField.onChange(value ?? "")
                }}
              >
                <SelectTrigger className="h-8 w-48 text-sm">
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  {creatorRelators.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              remove(idx)
            }}
          >
            <icon.Close className="h-3 w-3" />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => {
          append({ name: "", role: "" })
        }}
      >
        <icon.Add className="size-4" />
        Add contributor
      </Button>
    </div>
  )
}
