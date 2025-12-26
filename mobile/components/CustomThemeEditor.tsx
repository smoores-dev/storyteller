import { useRouter } from "expo-router"
import { ChevronDown } from "lucide-react-native"
import { cssInterop } from "nativewind"
import { useState } from "react"
import { View } from "react-native"
import { ScrollView } from "react-native-gesture-handler"
import {
  ReanimatedLogLevel,
  configureReanimatedLogger,
} from "react-native-reanimated"
import ColorPicker, {
  HueSlider,
  InputWidget,
  Panel1,
  Preview,
} from "reanimated-color-picker"

import { type ColorTheme } from "@/database/preferencesTypes"

import { ThemeOverrideProvider } from "./ThemeOverrideProvider"
import { ButtonGroup, ButtonGroupButton } from "./ui/ButtonGroup"
import { Group } from "./ui/Group"
import { Button } from "./ui/button"
import { Icon } from "./ui/icon"
import { Input } from "./ui/input"
import { Text } from "./ui/text"

declare module "reanimated-color-picker" {
  interface ColorPickerProps {
    className?: string | undefined
  }

  interface InputWidgetProps {
    className?: string | undefined
    inputClassName?: string | undefined
    inputTitleClassName?: string | undefined
  }
}

cssInterop(ColorPicker, { className: { target: "style" } })

cssInterop(InputWidget, {
  inputClassName: "inputStyle",
  inputTitleClassName: "inputTitleStyle",
  className: {
    target: false,
    nativeStyleToProp: {
      color: "iconColor",
    },
  },
})

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
    <ThemeOverrideProvider foreground={foreground} background={background}>
      <View className="android:pt-safe w-full flex-row items-center bg-background px-4 pb-4">
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
        className="flex-1 bg-background"
        contentContainerClassName="gap-4 pb-safe px-6"
      >
        <Text variant="h2">Custom theme</Text>
        <ButtonGroup value={isDark} onChange={setIsDark}>
          <ButtonGroupButton value={false}>
            <Text>Light</Text>
          </ButtonGroupButton>
          <ButtonGroupButton value={true}>
            <Text>Dark</Text>
          </ButtonGroupButton>
        </ButtonGroup>
        <Text className="text-lg">Theme name</Text>
        <Input value={name} onChangeText={setName} />
        <Text className="mt-4 self-center text-lg">Foreground color</Text>
        <ColorPicker
          className="mx-auto mb-4 w-[250px] gap-2"
          value={foreground}
          onChange={(result) => {
            setForeground(result.hex)
          }}
        >
          <Preview />
          <Panel1 />
          <HueSlider />
          <InputWidget
            className="text-foreground"
            inputClassName="border-secondary text-foreground"
            inputTitleClassName="text-foreground"
          />
        </ColorPicker>
        <Text className="self-center text-lg">Background color</Text>
        <ColorPicker
          className="m-auto w-[250px] gap-2"
          value={background}
          onChange={(result) => {
            setBackground(result.hex)
          }}
        >
          <Preview />
          <Panel1 />
          <HueSlider />
          <InputWidget
            className="text-foreground"
            inputClassName="border-secondary text-foreground"
            inputTitleClassName="text-foreground"
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
                foreground,
                background,
              })
            }}
          >
            <Text>Save</Text>
          </Button>
        </Group>
      </ScrollView>
    </ThemeOverrideProvider>
  )
}
