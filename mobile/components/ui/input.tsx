import { Platform, TextInput, type TextInputProps } from "react-native"

import { cn } from "@/lib/utils"

function Input({
  className,
  placeholderClassName,
  ...props
}: TextInputProps &
  React.RefAttributes<TextInput> & { placeholderClassName?: string }) {
  return (
    <TextInput
      className={cn(
        "border-input bg-background text-foreground dark:bg-input/30 flex min-h-10 w-full min-w-0 flex-row items-center rounded-md border px-3 py-1 text-base leading-5 shadow-xs shadow-black/5 sm:min-h-9",
        props.editable === false &&
          cn(
            "opacity-50",
            Platform.select({
              web: "disabled:pointer-events-none disabled:cursor-not-allowed",
            }),
          ),
        Platform.select({
          web: cn(
            "selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground transition-[color,box-shadow] outline-none md:text-sm",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
          ),
          native: "placeholder:text-muted-foreground/50",
        }),
        className,
      )}
      {...props}
    />
  )
}

export { Input }
