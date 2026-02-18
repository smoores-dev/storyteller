import * as BaseSlider from "@rn-primitives/slider"
import { useCallback, useLayoutEffect, useMemo, useState } from "react"
import { type LayoutChangeEvent, View, type ViewStyle } from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { useCSSVariable } from "uniwind"

import { debounce } from "@/debounce"
import { useColorTheme } from "@/hooks/useColorTheme"
import { cn } from "@/lib/utils"

const THUMB_SIZE = 20

interface Props {
  className?: string | undefined
  start: number
  stop: number
  step: number
  value: number
  onValueChange: (newValue: number) => void
  onPanStart?: (() => void) | undefined
  onPanStop?: (() => void) | undefined
  disabled?: boolean
}

export function Slider({
  className,
  onPanStart,
  onPanStop,
  onValueChange,
  disabled,
  ...props
}: Props) {
  const { background } = useColorTheme()
  const start = props.start / props.step
  const stop = props.stop / props.step

  const min = 0
  const max = 100

  const valueToPercentage = useCallback(
    (value: number) => {
      const range = stop - start
      if (range === 0) return 0
      return Math.round(((value / props.step - start) / range) * 100)
    },
    [props.step, start, stop],
  )

  const percentage = valueToPercentage(props.value)

  const [sliderWidth, setSliderWidth] = useState(0)

  const panning = useSharedValue(false)
  const startTranslateX = useSharedValue(0)
  const translateX = useSharedValue(0)

  const primaryColor = useCSSVariable("--color-primary") as string

  useLayoutEffect(() => {
    if (panning.value === true) return

    if (sliderWidth === 0) return
    const percentage = valueToPercentage(props.value)
    const newTranslateX = (percentage / 100) * sliderWidth
    if (translateX.value !== newTranslateX) translateX.set(newTranslateX)
  }, [panning, props.value, sliderWidth, translateX, valueToPercentage])

  const updateValue = useMemo(
    () =>
      debounce((newValue: number) => {
        onValueChange(newValue)
      }),
    [onValueChange],
  )

  const panGesture = Gesture.Pan()
    .enabled(!disabled)
    .onStart(() => {
      "worklet"
      panning.set(true)
      startTranslateX.set(translateX.get())
      if (onPanStart) scheduleOnRN(onPanStart)
    })
    .onUpdate((event) => {
      "worklet"
      if (sliderWidth === 0) return

      translateX.set(
        Math.min(
          Math.max(startTranslateX.get() + event.translationX, 0),
          sliderWidth,
        ),
      )
      const percentage = (translateX.value / sliderWidth) * 100
      const newValue = (percentage / 100) * (stop - start) + start

      const stepAlignedValue = Math.round(newValue) * props.step

      scheduleOnRN(updateValue, stepAlignedValue)
    })
    .onEnd(() => {
      "worklet"
      panning.set(false)
      if (onPanStop) scheduleOnRN(onPanStop)
    })

  const thumbAnimatedStyle = useAnimatedStyle(
    (): ViewStyle => ({
      transform: [{ translateX: translateX.value - THUMB_SIZE / 2 }],
    }),
  )

  const rangeAnimatedStyle = useAnimatedStyle((): ViewStyle => {
    const percentage =
      ((translateX.value - THUMB_SIZE / 2) / Math.max(1, sliderWidth)) * 100

    return {
      width: `${percentage}%`,
    }
  })

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout
    setSliderWidth(width)
  }

  return (
    <View
      className={cn(
        "relative",
        disabled ? "opacity-50" : "opacity-100",
        className,
      )}
      onLayout={handleLayout}
    >
      <GestureDetector gesture={panGesture}>
        <BaseSlider.Root
          className="relative h-1 flex-1 justify-center"
          min={min}
          max={max}
          value={
            Number.isNaN(percentage)
              ? 0
              : percentage === Infinity
                ? 100
                : percentage
          }
        >
          <BaseSlider.Track className="bg-secondary slider-track h-1 w-full rounded-full">
            <Animated.View
              data-slot="slider-track-range"
              role="presentation"
              style={[
                {
                  position: "absolute",
                  height: 4,
                  backgroundColor: primaryColor,
                  borderTopLeftRadius: 2,
                  borderBottomLeftRadius: 2,
                },
                rangeAnimatedStyle,
              ]}
            />
            <Animated.View
              accessibilityRole="adjustable"
              style={[
                {
                  position: "absolute",
                  height: THUMB_SIZE,
                  width: THUMB_SIZE,
                  backgroundColor: background,
                  borderRadius: 10,
                  borderWidth: 2,
                  borderColor: primaryColor,
                  top: -8,
                },
                thumbAnimatedStyle,
              ]}
            />
          </BaseSlider.Track>
        </BaseSlider.Root>
      </GestureDetector>
    </View>
  )
}
