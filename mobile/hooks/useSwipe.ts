import { GestureResponderEvent, useWindowDimensions } from "react-native"

export function useSwipe(
  onSwipeLeft?: () => void,
  onSwipeRight?: () => void,
  onPress?: (pageX: number) => void,
  rangeOffset = 4,
) {
  const dimensions = useWindowDimensions()
  let firstTouch = 0

  // set user touch start position
  function onTouchStart(e: GestureResponderEvent) {
    firstTouch = e.nativeEvent.pageX
  }

  // when touch ends check for swipe directions
  function onTouchEnd(e: GestureResponderEvent) {
    // get touch position and screen size
    const positionX = e.nativeEvent.pageX
    const range = dimensions.width / rangeOffset

    // check if position is growing positively and has reached specified range
    if (positionX - firstTouch > range) {
      onSwipeRight?.()
    }
    // check if position is growing negatively and has reached specified range
    else if (firstTouch - positionX > range) {
      onSwipeLeft?.()
    } else {
      onPress?.(firstTouch)
    }
  }

  return { onTouchStart, onTouchEnd }
}
