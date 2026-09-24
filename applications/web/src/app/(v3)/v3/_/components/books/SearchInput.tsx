import { type Hotkey } from "@tanstack/react-hotkeys"

import { Button } from "@v3/_/components/ui/button"
import { cn } from "@v3/_/lib/utils"

import { KeyboardShortcut } from "@/app/(v3)/v3/_/components/ui/kbd"
import * as icon from "@/icons"

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
  shortcut,
  children,
  ...props
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  shortcut?: Hotkey[]
} & Omit<React.ComponentProps<"input">, "onChange">) {
  return (
    <div
      className={cn(
        "bg-card border-border focus-within:border-primary focus-within:ring-primary/15 relative flex h-7 min-w-0 flex-1 items-center gap-2 rounded-full border px-3 py-1 transition-[border-color,box-shadow] focus-within:ring-2",
        className,
      )}
    >
      <icon.Search className="text-muted-foreground size-3 shrink-0" />
      <input
        placeholder={placeholder}
        value={value}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.currentTarget.blur()
            e.preventDefault()
            e.stopPropagation()
          }
        }}
        onChange={(e) => {
          onChange(e.target.value)
        }}
        className="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-xs outline-none"
        {...props}
      />
      {!value && shortcut && <KeyboardShortcut shortcut={shortcut} />}
      {children}
      {value && (
        <Button
          variant="ghost"
          size="xs"
          className="size-4 shrink-0 p-0"
          onClick={() => {
            onChange("")
          }}
        >
          <icon.Close className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}
