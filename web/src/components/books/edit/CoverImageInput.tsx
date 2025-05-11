import { Tabs, FileButton, Button, Image, Text } from "@mantine/core"
import { UseFormReturnType } from "@mantine/form"
import NextImage from "next/image"
import { useMemo } from "react"

interface Props {
  textCover: File | null
  audioCover: File | null
  textFallback: string
  audioFallback: string
  getInputProps: UseFormReturnType<{
    textCover: File | null
    audioCover: File | null
  }>["getInputProps"]
}

export function CoverImageInput({
  textCover,
  audioCover,
  textFallback,
  audioFallback,
  getInputProps,
}: Props) {
  const textCoverUrl = useMemo(
    () => (textCover ? URL.createObjectURL(textCover) : textFallback),
    [textCover, textFallback],
  )
  const audioCoverUrl = useMemo(
    () => (audioCover ? URL.createObjectURL(audioCover) : audioFallback),
    [audioCover, audioFallback],
  )

  return (
    <Tabs defaultValue="text-cover">
      <Tabs.List>
        <Tabs.Tab value="text-cover">Text</Tabs.Tab>
        <Tabs.Tab value="audio-cover">Audio</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="text-cover">
        <FileButton
          accept="image/jpeg,image/png"
          {...getInputProps("textCover")}
        >
          {(props) => (
            <Button
              {...props}
              variant="subtle"
              className="flex h-[max-content] w-[max-content] justify-center"
            >
              <Image
                className="rounded"
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
          {...getInputProps("audioCover")}
        >
          {(props) => (
            <Button
              {...props}
              variant="subtle"
              className="h-[max-content] w-[max-content]"
              classNames={{
                label: "flex justify-center bg-black rounded",
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
  )
}
