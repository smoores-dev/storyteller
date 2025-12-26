import * as DocumentPicker from "expo-document-picker"
import * as FileSystem from "expo-file-system/legacy"
import * as Fonts from "expo-font"
import { PlusIcon } from "lucide-react-native"
import { useState } from "react"
import { View } from "react-native"

import { getPreference } from "@/database/preferences"
import { useUpdateGlobalPreferenceMutation } from "@/store/localApi"
import {
  ensureFontsDirectory,
  getCustomFontUrl,
} from "@/store/persistence/fonts"

import { Stack } from "./ui/Stack"
import { Button } from "./ui/button"
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "./ui/dialog"
import { Icon } from "./ui/icon"
import { Input } from "./ui/input"
import { Text } from "./ui/text"

export function FontLoader() {
  const [loadedFont, setLoadedFont] =
    useState<DocumentPicker.DocumentPickerAsset | null>(null)

  const [updatePreference] = useUpdateGlobalPreferenceMutation()

  const [showFontName, setShowFontName] = useState(false)
  const [fontName, setFontName] = useState("")

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          className="w-full flex-row items-center sm:w-full"
          variant="ghost"
          size="icon"
          onPress={async () => {
            const result = await DocumentPicker.getDocumentAsync({
              type: [
                "application/x-font-ttf",
                "font/ttf",
                "application/x-font-otf",
                "font/otf",
              ],
              copyToCacheDirectory: true,
            })

            const newFont = result.assets?.[0]
            if (!newFont) return

            setLoadedFont(newFont)
            setShowFontName(true)
          }}
        >
          <Icon as={PlusIcon} size={16} />
          <Text> Custom font</Text>
        </Button>
      </DialogTrigger>
      <DialogContent className="w-screen max-w-[400px]">
        {showFontName && (
          <Stack className="gap-4">
            <Text variant="h2">Adding new font</Text>
            <Text className="font-semibold">{loadedFont?.name}</Text>
            <Text>Font name:</Text>
            <Input value={fontName} onChangeText={setFontName} />
            <View className="flex-row justify-between">
              <DialogClose asChild>
                <Button
                  variant="secondary"
                  onPress={() => {
                    setShowFontName(false)
                    setLoadedFont(null)
                    setFontName("")
                  }}
                >
                  <Text>Cancel</Text>
                </Button>
              </DialogClose>
              <DialogClose asChild>
                <Button
                  disabled={!fontName}
                  onPress={async () => {
                    setShowFontName(false)
                    setLoadedFont(null)
                    setFontName("")

                    if (!loadedFont) return

                    const type = loadedFont.mimeType?.includes("ttf")
                      ? "ttf"
                      : "otf"
                    const filename = `${fontName.replaceAll(" ", "_")}.${type}`
                    const customFontUrl = getCustomFontUrl(filename)

                    await ensureFontsDirectory()

                    await FileSystem.copyAsync({
                      from: loadedFont.uri,
                      to: customFontUrl,
                    })

                    await Fonts.loadAsync({
                      [fontName]: { uri: customFontUrl },
                    })

                    const currentFonts = await getPreference("customFonts")

                    await updatePreference({
                      name: "customFonts",
                      value: [
                        ...currentFonts,
                        {
                          name: fontName,
                          filename,
                          type,
                        },
                      ],
                    })
                  }}
                >
                  <Text>Save</Text>
                </Button>
              </DialogClose>
            </View>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  )
}
