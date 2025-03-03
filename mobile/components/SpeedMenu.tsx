import { StyleSheet, TouchableOpacity, useWindowDimensions } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { UIText } from "./UIText"
import { useAppDispatch, useAppSelector } from "../store/appState"
import { useColorTheme } from "../hooks/useColorTheme"
import { getBookPlayerSpeed } from "../store/selectors/preferencesSelectors"
import { preferencesSlice } from "../store/slices/preferencesSlice"
import { Stack } from "./ui/Stack"
import { spacing } from "./ui/tokens/spacing"
import { Group } from "./ui/Group"
import { Button } from "./ui/Button"
import { MinusCircle, PlusCircle } from "lucide-react-native"
import Slider from "@react-native-community/slider"
import { fontSizes } from "./ui/tokens/fontSizes"

type Props = {
  bookId: number
  topInset?: number | undefined
  onOutsideTap?: () => void
}

export function SpeedMenu({ bookId, topInset, onOutsideTap }: Props) {
  const { background, foreground, surface, dark } = useColorTheme()

  const insets = useSafeAreaInsets()
  const dimensions = useWindowDimensions()

  const dispatch = useAppDispatch()
  const currentSpeed = useAppSelector((state) =>
    getBookPlayerSpeed(state, bookId),
  )

  return (
    <>
      <TouchableOpacity
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 2,
        }}
        onPress={onOutsideTap}
      />
      <Stack
        style={[
          styles.container,
          {
            left: dimensions.width - 32 - 320,
            top: insets.top + 12 + (topInset ?? 0),
            borderColor: surface,
            backgroundColor: background,
          },
        ]}
      >
        <UIText>Playback speed</UIText>
        <UIText>{currentSpeed}x</UIText>
        <Group style={styles.sliderGroup}>
          <Button
            chromeless
            onPress={() => {
              dispatch(
                preferencesSlice.actions.playerSpeedChanged({
                  bookId: bookId,
                  speed: Math.round(((currentSpeed ?? 1) - 0.1) * 10) / 10,
                }),
              )
            }}
          >
            <MinusCircle size={spacing[2]} color={foreground} />
          </Button>
          <Slider
            style={styles.slider}
            value={currentSpeed}
            step={0.1}
            minimumValue={0.5}
            maximumValue={4.0}
            minimumTrackTintColor={foreground}
            maximumTrackTintColor={surface}
            thumbImage={
              dark
                ? require("../assets/slider-thumb-image-white.png")
                : require("../assets/slider-thumb-image-black.png")
            }
            onValueChange={(newValue) => {
              dispatch(
                preferencesSlice.actions.playerSpeedChanged({
                  bookId: bookId,
                  speed: Math.round(((newValue ?? 1) - 0.1) * 10) / 10,
                }),
              )
            }}
          />
          <Button
            chromeless
            onPress={() => {
              dispatch(
                preferencesSlice.actions.playerSpeedChanged({
                  bookId: bookId,
                  speed: Math.round(((currentSpeed ?? 1) + 0.1) * 10) / 10,
                }),
              )
            }}
          >
            <PlusCircle size={spacing[2]} color={foreground} />
          </Button>
        </Group>
        <Group style={styles.optionsGroup}>
          {[0.75, 1, 1.25, 1.5, 1.75, 2].map((speed) => (
            <Button
              style={styles.optionButton}
              key={speed}
              onPress={() => {
                dispatch(
                  preferencesSlice.actions.playerSpeedChanged({
                    bookId: bookId,
                    speed,
                  }),
                )
              }}
            >
              <UIText style={styles.optionText}>{speed}</UIText>
            </Button>
          ))}
        </Group>
      </Stack>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    right: 32,
    padding: spacing[2],
    borderRadius: spacing.borderRadius,
    borderWidth: 1,
    zIndex: 3,
    alignItems: "center",
  },
  sliderGroup: {
    gap: spacing[2],
    alignItems: "center",
  },
  slider: {
    flexGrow: 1,
  },
  optionButton: {
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[1],
  },
  optionsGroup: {
    gap: spacing[1],
    margin: spacing[1],
  },
  optionText: {
    ...fontSizes.xs,
  },
})
