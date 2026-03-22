import { Button, Fieldset, Switch, useComputedColorScheme } from "@mantine/core"
import { type ReactNode, useState } from "react"

import { ServerFilePicker } from "./books/modals/ServerFilePicker"

interface Props {
  value?: string | null
  onChange: (update: string | null) => void
  children?: ReactNode
  disabled?: boolean
}

export function ImportPathInput({
  value,
  onChange,
  children,
  disabled,
}: Props) {
  const [enableAutoimport, setEnableAutoimport] = useState(value !== null)
  const [importPathInteractive, setImportPathInteractive] = useState(false)
  const computedColorScheme = useComputedColorScheme()

  return (
    <Fieldset
      legend="Automatic import"
      className="flex flex-col gap-4"
      disabled={disabled}
    >
      {children}
      <Switch
        label="Enable"
        checked={enableAutoimport}
        onChange={(event) => {
          const value = event.target.checked
          if (value) {
            setEnableAutoimport(true)
            setImportPathInteractive(true)
          } else {
            setEnableAutoimport(false)
            setImportPathInteractive(false)
            onChange(null)
          }
        }}
      />
      {enableAutoimport &&
        (importPathInteractive ? (
          <ServerFilePicker
            startPath={value ?? "/"}
            onChange={(folder) => {
              onChange(folder)
              setImportPathInteractive(false)
            }}
          />
        ) : (
          <Button
            variant={computedColorScheme === "dark" ? "default" : "white"}
            classNames={{
              inner: "justify-start",
            }}
            onClick={() => {
              setImportPathInteractive(true)
            }}
          >
            {value ?? "Click to choose a path"}
          </Button>
        ))}
    </Fieldset>
  )
}
