import { ChevronDown } from "lucide-react-native"
import * as React from "react"
import { Platform, Pressable } from "react-native"

import { Icon } from "@/components/ui/icon"
import { Menu, type MenuAction } from "@/components/ui/menu"
import { Text, TextClassContext } from "@/components/ui/text"
import { cn } from "@/lib/utils"

export type Option = {
  value: string
  label: string
}

type RegisteredOption = Option & {
  disabled?: boolean
}

type SelectContextValue = {
  onValueChange: ((option?: Option) => void) | undefined
  options: RegisteredOption[]
  registerOption: (option: RegisteredOption) => () => void
  value: Option | undefined
}

const SelectContext = React.createContext<SelectContextValue | null>(null)

function useSelectContext() {
  const context = React.useContext(SelectContext)
  if (!context) {
    throw new Error("Select components must be rendered inside <Select>")
  }
  return context
}

export function Select({
  children,
  onValueChange,
  value,
}: React.PropsWithChildren<{
  onValueChange?: (option?: Option) => void
  value?: Option
}>) {
  const [options, setOptions] = React.useState<RegisteredOption[]>([])

  const registerOption = React.useCallback((option: RegisteredOption) => {
    setOptions((currentOptions) => {
      if (currentOptions.some(({ value }) => value === option.value)) {
        return currentOptions.map((currentOption) =>
          currentOption.value === option.value ? option : currentOption,
        )
      }
      return [...currentOptions, option]
    })

    return () => {
      setOptions((currentOptions) =>
        currentOptions.filter(({ value }) => value !== option.value),
      )
    }
  }, [])

  const contextValue = React.useMemo(
    () => ({
      onValueChange,
      options,
      registerOption,
      value,
    }),
    [onValueChange, options, registerOption, value],
  )

  return (
    <SelectContext.Provider value={contextValue}>
      {children}
    </SelectContext.Provider>
  )
}

export function SelectValue({
  className,
  placeholder,
  ...props
}: React.ComponentProps<typeof Text> & {
  placeholder?: string
}) {
  const { value } = useSelectContext()
  return (
    <Text
      className={cn(
        "text-foreground line-clamp-1 flex flex-row items-center gap-2 text-sm",
        !value && "text-muted-foreground",
        className,
      )}
      {...props}
    >
      {value?.label ?? placeholder}
    </Text>
  )
}

export function SelectTrigger({
  accessibilityLabel,
  children,
  className,
  disabled,
  iconColor = "muted-foreground",
  ref,
  size = "default",
  ...props
}: React.ComponentProps<typeof Pressable> &
  React.RefAttributes<typeof Pressable> & {
    disabled?: boolean
    iconColor?: string
    size?: "default" | "sm"
  }) {
  const { onValueChange, options, value } = useSelectContext()
  const actions = React.useMemo<MenuAction[]>(
    () =>
      options.map((option) => ({
        id: option.value,
        title: option.label,
        state: value?.value === option.value ? "on" : "off",
        ...(disabled || option.disabled
          ? { attributes: { disabled: true } }
          : {}),
        onPress: () => {
          onValueChange?.({ label: option.label, value: option.value })
        },
      })),
    [disabled, onValueChange, options, value?.value],
  )

  return (
    <TextClassContext.Provider value="text-foreground text-sm">
      <Menu
        actions={actions}
        {...(accessibilityLabel ? { title: accessibilityLabel } : {})}
      >
        <Pressable
          ref={ref}
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          className={cn(
            "border-input bg-background dark:bg-input/30 dark:active:bg-input/50 flex flex-row items-center justify-between gap-2 rounded-md border px-3 py-2 shadow-xs shadow-black/5",
            Platform.select({
              web: "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive focus-visible:border-ring focus-visible:ring-ring/50 dark:hover:bg-input/50 w-fit text-sm whitespace-nowrap transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:shrink-0",
            }),
            disabled && "opacity-50",
            size === "sm" && "h-8 py-2 sm:py-1.5",
            className,
          )}
          {...props}
        >
          <>{children}</>
          <Icon
            as={ChevronDown}
            aria-hidden={true}
            className={cn("size-4", "text-" + iconColor)}
          />
        </Pressable>
      </Menu>
    </TextClassContext.Provider>
  )
}

export function SelectItem({
  disabled = false,
  label,
  value,
}: {
  disabled?: boolean
  label: string
  value: string
}) {
  const { registerOption } = useSelectContext()

  React.useEffect(
    () => registerOption({ disabled, label, value }),
    [disabled, label, registerOption, value],
  )

  return null
}
