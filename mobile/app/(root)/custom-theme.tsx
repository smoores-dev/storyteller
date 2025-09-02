import { useRouter } from "expo-router"
import { useMemo, useState } from "react"
import { StyleSheet } from "react-native"
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

import { HeaderText } from "../../components/HeaderText"
import { ThemeOverrideProvider } from "../../components/ThemeOverrideProvider"
import { UIText } from "../../components/UIText"
import { Button } from "../../components/ui/Button"
import { ButtonGroup, ButtonGroupButton } from "../../components/ui/ButtonGroup"
import { Group } from "../../components/ui/Group"
import { TextInput } from "../../components/ui/TextInput"
import {
  computeForegroundSecondary,
  computeSurface,
} from "../../components/ui/tokens/colors"
import { fontSizes } from "../../components/ui/tokens/fontSizes"
import { spacing } from "../../components/ui/tokens/spacing"
import { useColorTheme } from "../../hooks/useColorTheme"
import { useAppDispatch } from "../../store/appState"
import { preferencesSlice } from "../../store/slices/preferencesSlice"

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false, // Reanimated runs in strict mode by default
})

export default function CustomThemePage() {
  const { foreground: initialForeground, background: initialBackground } =
    useColorTheme()

  const [foreground, setForeground] = useState(initialForeground)
  const [background, setBackground] = useState(initialBackground)
  const surface = useMemo(
    () => computeSurface(foreground, background),
    [background, foreground],
  )
  const foregroundSecondary = useMemo(
    () => computeForegroundSecondary(foreground, background),
    [background, foreground],
  )

  const router = useRouter()

  const [name, setName] = useState("")

  const [isDark, setIsDark] = useState(false)

  const dispatch = useAppDispatch()

  return (
    <ThemeOverrideProvider
      foreground={foreground}
      surface={surface}
      foregroundSecondary={foregroundSecondary}
      background={background}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: background }]}
        contentContainerStyle={styles.contentContainer}
      >
        <HeaderText style={{ ...fontSizes["3xl"] }}>
          Create Custom Theme
        </HeaderText>
        <ButtonGroup value={isDark} onChange={setIsDark}>
          <ButtonGroupButton value={false}>
            <UIText>Light</UIText>
          </ButtonGroupButton>
          <ButtonGroupButton value={true}>
            <UIText>Dark</UIText>
          </ButtonGroupButton>
        </ButtonGroup>
        <UIText style={styles.label}>Theme name</UIText>
        <TextInput value={name} onChangeText={setName} />
        <UIText style={styles.label}>Foreground color</UIText>
        <ColorPicker
          style={styles.picker}
          value={foreground}
          onChange={(result) => {
            setForeground(result.hex)
          }}
        >
          <Preview />
          <Panel1 />
          <HueSlider />
          <InputWidget
            inputStyle={{ borderColor: surface, color: foreground }}
            inputTitleStyle={{ color: foreground }}
            iconColor={foreground}
          />
        </ColorPicker>
        <UIText style={styles.label}>Background color</UIText>
        <ColorPicker
          style={styles.picker}
          value={background}
          onChange={(result) => {
            setBackground(result.hex)
          }}
        >
          <Preview />
          <Panel1 />
          <HueSlider />
          <InputWidget
            inputStyle={{ borderColor: surface, color: foreground }}
            inputTitleStyle={{ color: foreground }}
            iconColor={foreground}
          />
        </ColorPicker>
        <Group style={{ justifyContent: "flex-end" }}>
          <Button
            variant="primary"
            disabled={!name.trim()}
            onPress={() => {
              dispatch(
                preferencesSlice.actions.customThemeSaved({
                  theme: {
                    name,
                    foreground,
                    foregroundSecondary,
                    background,
                    surface,
                    isDark,
                  },
                }),
              )
              router.back()
            }}
          >
            <UIText>Save</UIText>
          </Button>
        </Group>
      </ScrollView>
    </ThemeOverrideProvider>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    gap: spacing[2],
    padding: spacing[3],
  },
  label: {
    ...fontSizes.lg,
  },
  picker: {
    width: "70%",
    margin: "auto",
    gap: spacing[1],
  },
})
