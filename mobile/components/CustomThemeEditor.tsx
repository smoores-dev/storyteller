import { useRouter } from "expo-router"
import { ChevronDown } from "lucide-react-native"
import { useState } from "react"
import { View } from "react-native"
import { ScrollView } from "react-native-gesture-handler"
import {
  ReanimatedLogLevel,
  configureReanimatedLogger,
} from "react-native-reanimated"
import BaseColorPicker, {
  HueSlider,
  InputWidget as BaseInputWidget,
  Panel1,
  Preview,
} from "reanimated-color-picker"
import { withUniwind } from "uniwind"

import { type ColorTheme } from "@/database/preferencesTypes"

import { ButtonGroup, ButtonGroupButton } from "./ui/ButtonGroup"
import { Group } from "./ui/Group"
import { Button } from "./ui/button"
import { Icon } from "./ui/icon"
import { Input } from "./ui/input"
import { Text } from "./ui/text"

const ColorPicker = withUniwind(BaseColorPicker)

const InputWidget = withUniwind(BaseInputWidget)

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false, // Reanimated runs in strict mode by default
})

interface Props {
  initialTheme: ColorTheme
  onSave: (theme: ColorTheme) => void
}

export function CustomThemeEditor({ initialTheme, onSave }: Props) {
  const router = useRouter()

  const [foreground, setForeground] = useState(initialTheme.foreground)
  const [background, setBackground] = useState(initialTheme.background)
  const [name, setName] = useState(initialTheme.name)
  const [isDark, setIsDark] = useState(initialTheme.isDark)

  return (
    <>
      <View className="android:pt-safe bg-background w-full flex-row items-center px-4 pb-4">
        <Button
          variant="ghost"
          size="icon"
          onPress={() => {
            router.back()
          }}
        >
          <Icon as={ChevronDown} size={24} />
        </Button>
      </View>
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: background }}
        contentContainerClassName="gap-4 pb-safe px-6"
      >
        <Text variant="h2" style={{ color: foreground }}>
          Custom theme
        </Text>
        <ButtonGroup value={isDark} onChange={setIsDark}>
          <ButtonGroupButton value={false}>
            <Text style={isDark && { color: foreground }}>Light</Text>
          </ButtonGroupButton>
          <ButtonGroupButton value={true}>
            <Text style={!isDark && { color: foreground }}>Dark</Text>
          </ButtonGroupButton>
        </ButtonGroup>
        <Text className="text-lg" style={{ color: foreground }}>
          Theme name
        </Text>
        <Input
          value={name}
          onChangeText={setName}
          style={{ color: foreground }}
        />
        <Text
          className="mt-4 self-center text-lg"
          style={{ color: foreground }}
        >
          Foreground color
        </Text>
        <ColorPicker
          className="mx-auto mb-4 w-62.5 gap-2"
          value={foreground}
          onChange={(result) => {
            setForeground(result.hex)
          }}
        >
          <Preview />
          <Panel1 />
          <HueSlider />
          <InputWidget
            iconColor={foreground}
            inputStyle={{
              color: foreground,
            }}
            inputClassName="border-secondary"
            inputTitleStyle={{ color: foreground }}
          />
        </ColorPicker>
        <Text className="self-center text-lg" style={{ color: foreground }}>
          Background color
        </Text>
        <ColorPicker
          className="m-auto w-62.5 gap-2"
          value={background}
          onChange={(result) => {
            setBackground(result.hex)
          }}
        >
          <Preview />
          <Panel1 />
          <HueSlider />
          <InputWidget
            iconColor={foreground}
            inputStyle={{
              color: foreground,
            }}
            inputClassName="border-secondary"
            inputTitleStyle={{ color: foreground }}
          />
        </ColorPicker>
        <Group className="justify-end">
          <Button
            className="mb-6 w-full"
            disabled={!name.trim()}
            onPress={() => {
              onSave({
                name,
                isDark,
                foreground: foreground.slice(0, 7),
                background: background.slice(0, 7),
              })
            }}
          >
            <Text>Save</Text>
          </Button>
        </Group>
      </ScrollView>
    </>
  )
}
