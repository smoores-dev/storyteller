import { PlusIcon } from "lucide-react-native"
import { Button } from "./ui/Button"
import { colors } from "./ui/tokens/colors"
import { spacing } from "./ui/tokens/spacing"
import { UIText } from "./UIText"
import * as DocumentPicker from "expo-document-picker"
import * as FileSystem from "expo-file-system"
import {
  ensureFontsDirectory,
  getCustomFontUrl,
} from "../store/persistence/fonts"
import { useAppDispatch } from "../store/appState"
import { preferencesSlice } from "../store/slices/preferencesSlice"
import * as Fonts from "expo-font"
import { useState } from "react"
import { View } from "react-native"
import { TextInput } from "./ui/TextInput"
import { useColorTheme } from "../hooks/useColorTheme"
import { HeaderText } from "./HeaderText"

export function FontLoader() {
  const { background, surface } = useColorTheme()
  const dispatch = useAppDispatch()

  const [loadedFont, setLoadedFont] =
    useState<DocumentPicker.DocumentPickerAsset | null>(null)
  const [showFontName, setShowFontName] = useState(false)
  const [fontName, setFontName] = useState("")

  return (
    <>
      {showFontName && (
        <View
          style={{
            position: "absolute",
            top: "50%",
            left: "2.5%",
            width: "95%",
            padding: spacing["1.5"],
            borderRadius: spacing.borderRadius,
            borderColor: surface,
            borderWidth: 1,
            gap: spacing[2],
            transform: [{ translateY: -100 }],
            backgroundColor: background,
          }}
        >
          <HeaderText>Adding new font</HeaderText>
          <UIText>{loadedFont?.name}</UIText>
          <UIText>Font name:</UIText>
          <TextInput value={fontName} onChangeText={setFontName} />
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Button
              onPress={() => {
                setShowFontName(false)
                setLoadedFont(null)
                setFontName("")
              }}
            >
              <UIText>Cancel</UIText>
            </Button>
            <Button
              disabled={!fontName}
              variant="primary"
              onPress={async () => {
                setShowFontName(false)
                setLoadedFont(null)
                setFontName("")

                if (!loadedFont) return
                const customFontUrl = getCustomFontUrl(
                  `${fontName}.${
                    loadedFont.mimeType?.includes("ttf") ? "ttf" : "otf"
                  }`,
                )

                await ensureFontsDirectory()

                await FileSystem.copyAsync({
                  from: loadedFont.uri,
                  to: customFontUrl,
                })

                await Fonts.loadAsync({
                  [fontName]: { uri: customFontUrl },
                })

                dispatch(
                  preferencesSlice.actions.customFontLoaded({
                    fontUrl: customFontUrl,
                  }),
                )
              }}
            >
              <UIText>Save</UIText>
            </Button>
          </View>
        </View>
      )}
      <Button
        style={{ flexDirection: "row", alignItems: "center" }}
        chromeless
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
        <PlusIcon color={colors.primary9} size={spacing[2]} />
        <UIText style={{ color: colors.primary9 }}> Custom font</UIText>
      </Button>
    </>
  )
}
