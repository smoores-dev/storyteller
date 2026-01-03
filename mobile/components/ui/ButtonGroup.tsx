import {
  type ReactElement,
  cloneElement,
  createContext,
  useContext,
  useMemo,
} from "react"
import { View } from "react-native"

import { cn } from "@/lib/utils"

import { Button, type ButtonProps } from "./button"

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
      <View className="flex-row">
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
      className={cn({
        "bg-transparent": currentValue !== value,
        "rounded-tr-none rounded-br-none":
          neighbors === "right" || neighbors === "both",
        "rounded-tl-none rounded-bl-none":
          neighbors === "left" || neighbors === "both",
      })}
      onPress={() => onPress(value)}
      variant={currentValue === value ? "default" : "secondary"}
    />
  )
}
