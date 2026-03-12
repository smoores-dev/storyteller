import { Button, FileButton, Image, Tabs, Text } from "@mantine/core"
import { type UseFormReturnType } from "@mantine/form"
import { useMemo } from "react"

function CoverInput({
  inputProps,
  coverUrl,
  height,
}: {
  inputProps: ReturnType<
    UseFormReturnType<{
      textCover: File | null
    }>["getInputProps"]
  >
  coverUrl: string
  height: number
}) {
  return (
    <FileButton accept="image/jpeg,image/png" {...inputProps}>
      {(props) => (
        <Button
          {...props}
          variant="subtle"
          className="flex h-max w-max justify-center"
        >
          <Image
            className="rounded-sm"
            h={height * 3}
            w={64 * 3}
            src={coverUrl}
            alt=""
            aria-hidden
          />
          <Text
            c="black"
            className="bg-opacity-90 absolute bottom-4 left-0 inline-block w-full bg-white py-2 dark:bg-neutral-800"
          >
            Edit cover art
          </Text>
        </Button>
      )}
    </FileButton>
  )
}

interface Props {
  mediaType: "both" | "ebook" | "audiobook"
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
  mediaType,
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

  if (mediaType === "ebook") {
    return (
      <CoverInput
        inputProps={getInputProps("textCover")}
        coverUrl={textCoverUrl}
        height={98}
      />
    )
  }

  if (mediaType === "audiobook") {
    return (
      <CoverInput
        inputProps={getInputProps("audioCover")}
        coverUrl={audioCoverUrl}
        height={64}
      />
    )
  }

  return (
    <Tabs defaultValue="text-cover">
      <Tabs.List>
        <Tabs.Tab value="text-cover">Text</Tabs.Tab>
        <Tabs.Tab value="audio-cover">Audio</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="text-cover">
        <CoverInput
          inputProps={getInputProps("textCover")}
          coverUrl={textCoverUrl}
          height={98}
        />
      </Tabs.Panel>
      <Tabs.Panel value="audio-cover">
        <CoverInput
          inputProps={getInputProps("audioCover")}
          coverUrl={audioCoverUrl}
          height={64}
        />
      </Tabs.Panel>
    </Tabs>
  )
}
