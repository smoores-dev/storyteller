"use client"

import NextImage from "next/image"
import { BookDetail } from "@/apiModels"
import { useApiClient } from "@/hooks/useApiClient"
import { useMemo, useState } from "react"
import { useForm } from "@mantine/form"
import {
  FileButton,
  Button,
  Tabs,
  Image,
  Group,
  Stack,
  TextInput,
  Text,
  Fieldset,
  ActionIcon,
} from "@mantine/core"
import { IconPlus, IconTrash } from "@tabler/icons-react"

type Props = {
  book: BookDetail
}

enum SaveState {
  CLEAN = "CLEAN",
  LOADING = "LOADING",
  SAVED = "SAVED",
  ERROR = "ERROR",
}

export function BookEditForm({ book }: Props) {
  const client = useApiClient()

  const form = useForm({
    initialValues: {
      title: book.title,
      language: book.language,
      authors: book.authors,
      textCover: null as File | null,
      audioCover: null as File | null,
    },
  })

  const { textCover, audioCover, authors } = form.getValues()
  const textCoverUrl = useMemo(
    () =>
      textCover
        ? URL.createObjectURL(textCover)
        : client.getCoverUrl(book.uuid),
    [book.uuid, client, textCover],
  )
  const audioCoverUrl = useMemo(
    () =>
      audioCover
        ? URL.createObjectURL(audioCover)
        : client.getCoverUrl(book.uuid, true),
    [book.uuid, client, audioCover],
  )

  const [savedState, setSavedState] = useState<SaveState>(SaveState.CLEAN)

  return (
    <>
      {savedState === SaveState.SAVED && <p>Saved!</p>}
      {savedState === SaveState.ERROR && (
        <p>Failed to update. Check your server logs for details.</p>
      )}
      <form
        onSubmit={form.onSubmit(async (values) => {
          setSavedState(SaveState.LOADING)
          try {
            await client.updateBook(
              book.uuid,
              values.title,
              values.language,
              values.authors,
              values.textCover,
              values.audioCover,
            )
          } catch (_) {
            setSavedState(SaveState.ERROR)
            return
          }

          setSavedState(SaveState.SAVED)
        })}
      >
        <Group align="stretch" gap="xl" mt="lg">
          <Tabs defaultValue="text-cover">
            <Tabs.List>
              <Tabs.Tab value="text-cover">Text</Tabs.Tab>
              <Tabs.Tab value="audio-cover">Audio</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="text-cover">
              <FileButton
                accept="image/jpeg,image/png"
                {...form.getInputProps("textCover")}
              >
                {(props) => (
                  <Button
                    {...props}
                    variant="subtle"
                    className="flex h-[max-content] w-[max-content] justify-center"
                  >
                    <Image
                      component={NextImage}
                      height={98 * 3}
                      width={64 * 3}
                      h={98 * 3}
                      w={64 * 3}
                      src={textCoverUrl}
                      alt=""
                      aria-hidden
                    />
                    <Text
                      c="black"
                      className="absolute bottom-4 left-0 inline-block w-full bg-white bg-opacity-90 py-2"
                    >
                      Edit cover art
                    </Text>
                  </Button>
                )}
              </FileButton>
            </Tabs.Panel>
            <Tabs.Panel value="audio-cover">
              <FileButton
                accept="image/jpeg,image/png"
                {...form.getInputProps("audioCover")}
              >
                {(props) => (
                  <Button
                    {...props}
                    variant="subtle"
                    className="h-[max-content] w-[max-content]"
                    classNames={{
                      label: "flex justify-center bg-black",
                    }}
                  >
                    <Image
                      component={NextImage}
                      fit="contain"
                      height={64 * 3}
                      width={64 * 3}
                      h={64 * 3}
                      w={64 * 3}
                      src={audioCoverUrl}
                      alt=""
                      aria-hidden
                    />
                    <Text
                      c="black"
                      className="absolute bottom-4 left-0 inline-block w-full bg-white bg-opacity-90 py-2"
                    >
                      Edit cover art
                    </Text>
                  </Button>
                )}
              </FileButton>
            </Tabs.Panel>
          </Tabs>
          <Stack gap={0} className="grow">
            <TextInput label="Title" {...form.getInputProps("title")} />
            <TextInput label="Language" {...form.getInputProps("language")} />
            {authors.map((author, i) => (
              <Fieldset
                key={author.uuid || i}
                legend="Author"
                className="relative"
              >
                <TextInput
                  label="Name"
                  {...form.getInputProps(`authors.${i}.name`)}
                />
                <TextInput
                  label="Role"
                  {...form.getInputProps(`authors.${i}.role`)}
                />
                {i > 0 && (
                  <ActionIcon
                    variant="subtle"
                    className="absolute right-4 top-0"
                    onClick={() => {
                      form.removeListItem("authors", i)
                    }}
                  >
                    <IconTrash color="red" />
                  </ActionIcon>
                )}
              </Fieldset>
            ))}
            <Button
              leftSection={<IconPlus />}
              variant="outline"
              mt="sm"
              className="self-end"
              onClick={() => {
                form.insertListItem("authors", {
                  name: "",
                  role: "Author",
                  uuid: "",
                  file_as: "",
                })
              }}
            >
              Add author
            </Button>
          </Stack>
        </Group>

        <Group justify="flex-end" className="sticky bottom-0 z-10 bg-white p-6">
          <Button type="submit">Save</Button>
        </Group>
      </form>
    </>
  )
}
