import { memo, useMemo } from "react"
import { View, type ViewProps } from "react-native"

export type HidableViewProps = Omit<
  ViewProps,
  "aria-hidden" | "pointerEvents" | "importantForAccessibility"
> & {
  hidden?: boolean
}

export const HideableView = memo(
  ({ hidden = false, ...props }: HidableViewProps) => {
    return (
      <View
        {...props}
        aria-hiden={hidden}
        pointerEvents={hidden ? "none" : "auto"}
        importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
        style={useMemo(
          () => [props.style, { opacity: hidden ? 0 : 1 }],
          [props.style, hidden],
        )}
      />
    )
  },
)
HideableView.displayName = "HideableView"
