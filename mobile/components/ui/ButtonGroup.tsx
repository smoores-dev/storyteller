import {
  ReactElement,
  cloneElement,
  createContext,
  useContext,
  useMemo,
} from "react"
import { StyleSheet, View } from "react-native"
import { Button, ButtonProps } from "./Button"

type ButtonGroupContextValue = {
  onPress: (value: unknown) => void
  currentValue: unknown
}

const ButtonGroupContext = createContext(
  null as unknown as ButtonGroupContextValue,
)

type Props<Value> = {
  children: ReactElement<{
    value: Value
    neighbors?: "left" | "right" | "both"
  }>[]
  onChange: (value: Value) => void
  value: Value
}

export function ButtonGroup<Value>({
  value,
  onChange,
  children,
}: Props<Value>) {
  const contextValue = useMemo(
    () =>
      ({
        currentValue: value,
        onPress: onChange as (value: unknown) => void,
      }) satisfies ButtonGroupContextValue,
    [onChange, value],
  )

  return (
    <ButtonGroupContext.Provider value={contextValue}>
      <View style={styles.group}>
        {children.map((child, i) => {
          if (children.length === 1) return child
          if (i === 0 && children.length > 1) {
            return cloneElement(child, {
              key: String(child.props.value),
              neighbors: "right",
            })
          }
          if (i === children.length - 1) {
            return cloneElement(child, {
              key: String(child.props.value),
              neighbors: "left",
            })
          }
          return cloneElement(child, {
            key: String(child.props.value),
            neighbors: "both",
          })
        })}
      </View>
    </ButtonGroupContext.Provider>
  )
}

export function ButtonGroupButton<Value>({
  value,
  neighbors,
  ...props
}: ButtonProps & { value: Value; neighbors?: "left" | "right" | "both" }) {
  const { onPress, currentValue } = useContext(ButtonGroupContext)
  return (
    <Button
      {...props}
      style={{
        ...(currentValue !== value && { backgroundColor: "transparent" }),
        // This doesn't work for some reason that I can't understand,
        // even if we change the Button styles to use border_____Radius,
        // too
        ...((neighbors === "right" || neighbors === "both") && {
          borderTopRightRadius: 0,
          borderBottomRightRadius: 0,
        }),
        ...((neighbors === "left" || neighbors === "both") && {
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
        }),
      }}
      onPress={() => onPress(value)}
      variant={currentValue === value ? "primary" : "secondary"}
    />
  )
}

const styles = StyleSheet.create({
  group: {
    flexDirection: "row",
  },
  button: {
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
})
