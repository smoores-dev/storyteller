import { zodResolver } from "@hookform/resolvers/zod"
import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod/v4"

import { Button } from "@v3/_/components/ui/button"
import { ColorPicker } from "@v3/_/components/ui/color-picker"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "@v3/_/components/ui/combobox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@v3/_/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@v3/_/components/ui/field"
import { IconPicker } from "@v3/_/components/ui/icon-picker"
import { Input } from "@v3/_/components/ui/input"
import { Switch } from "@v3/_/components/ui/switch"
import { Textarea } from "@v3/_/components/ui/textarea"

import { BookSelector } from "@/app/(v3)/v3/_/components/shelves/ShelfEditor"
import {
  useAddBooksToCollectionsMutation,
  useCreateCollectionMutation,
  useGetCurrentUserQuery,
  useListCollectionsQuery,
  useListUsersQuery,
  useUpdateCollectionMutation,
} from "@/store/api"
import { type UUID } from "@/uuid"

const collectionSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
})

type CollectionFormData = z.infer<typeof collectionSchema>

type CreateCollectionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (uuid: string) => void
  initialName?: string
  // when set, the dialog edits the matching collection; full values are
  // resolved from the collections list query.
  collectionUuid?: string | null
}

export function CreateCollectionDialog({
  open,
  onOpenChange,
  onCreated,
  initialName = "",
  collectionUuid,
}: CreateCollectionDialogProps) {
  const isEditing = !!collectionUuid
  const [createCollection, { isLoading: isCreating }] =
    useCreateCollectionMutation()
  const [updateCollection, { isLoading: isUpdating }] =
    useUpdateCollectionMutation()
  const isLoading = isCreating || isUpdating

  const { data: collections = [] } = useListCollectionsQuery()
  const { data: allUsers = [] } = useListUsersQuery()
  const { data: currentUser } = useGetCurrentUserQuery()

  const editingCollection = collectionUuid
    ? collections.find((c) => c.uuid === collectionUuid)
    : undefined

  // you're always a member of your own collections, so the invite list only
  // offers (and shows) other users.
  const invitableUsers = allUsers.filter((user) => user.id !== currentUser?.id)

  const [icon, setIcon] = useState<string | null>(null)
  const [color, setColor] = useState<string | null>(null)
  const [isPublic, setIsPublic] = useState(true)
  const [memberIds, setMemberIds] = useState<UUID[]>([])
  const [bookUuids, setBookUuids] = useState<string[]>([])
  const [addBooksToCollections] = useAddBooksToCollectionsMutation()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CollectionFormData>({
    resolver: zodResolver(collectionSchema),
    defaultValues: {
      name: initialName,
      description: "",
    },
  })

  useEffect(() => {
    if (!open) return

    if (editingCollection) {
      reset({
        name: editingCollection.name,
        description: editingCollection.description ?? "",
      })
      setIcon(editingCollection.icon ?? null)
      setColor(editingCollection.color ?? null)
      setIsPublic(editingCollection.public)
      setMemberIds(
        editingCollection.users
          .filter((user) => user.id !== currentUser?.id)
          .map((user) => user.id),
      )
    } else if (!collectionUuid) {
      reset({ name: initialName, description: "" })
      setIcon(null)
      setColor(null)
      setIsPublic(true)
      setMemberIds([])
      setBookUuids([])
    }
  }, [
    open,
    editingCollection,
    collectionUuid,
    initialName,
    currentUser?.id,
    reset,
  ])

  const handleClose = useCallback(() => {
    reset()
    onOpenChange(false)
  }, [reset, onOpenChange])

  const onSubmit = useCallback(
    async (data: CollectionFormData) => {
      try {
        if (isEditing && collectionUuid) {
          await updateCollection({
            uuid: collectionUuid as UUID,
            update: {
              name: data.name,
              description: data.description ?? null,
              icon,
              color,
              public: isPublic,
              users: memberIds,
            },
          }).unwrap()

          onCreated?.(collectionUuid)
        } else {
          const result = await createCollection({
            name: data.name,
            description: data.description ?? "",
            public: isPublic,
            users: memberIds,
          }).unwrap()

          // create doesn't accept icon/color, so set them in a follow-up update
          if (icon || color) {
            await updateCollection({
              uuid: result.uuid,
              update: { icon, color },
            }).unwrap()
          }

          if (bookUuids.length > 0) {
            await addBooksToCollections({
              collections: [result.uuid],
              books: bookUuids as UUID[],
            }).unwrap()
          }

          onCreated?.(result.uuid)
        }

        handleClose()
      } catch {
        // error handling is done via the mutation error state
      }
    },
    [
      createCollection,
      updateCollection,
      addBooksToCollections,
      collectionUuid,
      isEditing,
      icon,
      color,
      isPublic,
      memberIds,
      bookUuids,
      onCreated,
      handleClose,
    ],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Collection" : "Create Collection"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the collection settings."
              : "Create a new collection to organize your books."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="collection-name">Name</FieldLabel>
              <Input
                id="collection-name"
                placeholder="My Collection"
                {...register("name")}
              />
              {errors.name && <FieldError>{errors.name.message}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="collection-description">
                Description
              </FieldLabel>
              <Textarea
                id="collection-description"
                placeholder="Optional description..."
                rows={3}
                {...register("description")}
              />
            </Field>

            <Field>
              <FieldLabel>Icon & Color</FieldLabel>
              <div className="flex items-center gap-2">
                <IconPicker value={icon} onChange={setIcon} color={color} />
                <ColorPicker value={color} onChange={setColor} />
              </div>
            </Field>

            {!isEditing && (
              <Field>
                <FieldLabel>Books</FieldLabel>
                <BookSelector
                  selectedBookUuids={bookUuids}
                  onAdd={(uuid) => {
                    setBookUuids((prev) =>
                      prev.includes(uuid) ? prev : [...prev, uuid],
                    )
                  }}
                  onRemove={(uuid) => {
                    setBookUuids((prev) => prev.filter((u) => u !== uuid))
                  }}
                />
              </Field>
            )}

            <Field orientation="horizontal">
              <Switch
                id="collection-public"
                checked={isPublic}
                onCheckedChange={setIsPublic}
              />
              <FieldLabel htmlFor="collection-public">Public</FieldLabel>
            </Field>

            <Field>
              <FieldLabel>Invite users</FieldLabel>
              <Combobox
                items={invitableUsers.map((user) => ({
                  value: user.id,
                  label: user.username ?? user.email,
                }))}
                multiple
                value={memberIds}
                onValueChange={(ids) => {
                  setMemberIds(ids)
                }}
              >
                <ComboboxChips>
                  <ComboboxValue>
                    {invitableUsers
                      .filter((user) => memberIds.includes(user.id))
                      .map((user) => (
                        <ComboboxChip key={user.id}>
                          {user.username ?? user.email}
                        </ComboboxChip>
                      ))}
                  </ComboboxValue>
                  <ComboboxChipsInput placeholder="Add people..." />
                </ComboboxChips>
                <ComboboxContent>
                  <ComboboxEmpty>No users found.</ComboboxEmpty>
                  <ComboboxList>
                    {invitableUsers.map((user) => (
                      <ComboboxItem key={user.id} value={user.id}>
                        {user.username ?? user.email}
                      </ComboboxItem>
                    ))}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              <FieldDescription>
                Only applies to private collections.
              </FieldDescription>
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading
                ? isEditing
                  ? "Saving..."
                  : "Creating..."
                : isEditing
                  ? "Save"
                  : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
