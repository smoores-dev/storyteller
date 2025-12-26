import * as SwitchPrimitives from "@rn-primitives/switch"
import { Platform } from "react-native"

import { cn } from "@/lib/utils"

function Switch({
  className,
  ...props
}: SwitchPrimitives.RootProps & React.RefAttributes<SwitchPrimitives.RootRef>) {
  return (
    <SwitchPrimitives.Root
      className={cn(
        "flex h-[1.15rem] w-8 shrink-0 flex-row items-center rounded-full border border-transparent shadow-sm shadow-black/5",
        Platform.select({
          web: "peer inline-flex outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed",
        }),
        props.checked ? "bg-primary" : "bg-input dark:bg-input/80",
        props.disabled && "opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          "size-4 rounded-full bg-background",
          // TODO: Figure out why this transition causes the app to crash with
          // an error about refs not being passed (probably/hopefully a react-native-css-interop bug)
          // "bg-background size-4 rounded-full transition-transform",
          Platform.select({
            web: "pointer-events-none block ring-0",
          }),
          props.checked
            ? "translate-x-3.5 dark:bg-primary-foreground"
            : "translate-x-0 dark:bg-foreground",
        )}
      />
    </SwitchPrimitives.Root>
  )
}

export { Switch }
