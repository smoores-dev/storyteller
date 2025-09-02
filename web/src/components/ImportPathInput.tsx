import { Button, Fieldset, Switch } from "@mantine/core"
import { type ReactNode, useState } from "react"

import { ServerFilePicker } from "./books/modals/ServerFilePicker"

interface Props {
  value?: string | null
  onChange: (update: string | null) => void
  children?: ReactNode
}

export function ImportPathInput({ value, onChange, children }: Props) {
  const [enableAutoimport, setEnableAutoimport] = useState(value !== null)
  const [importPathInteractive, setImportPathInteractive] = useState(false)

  return (
    <Fieldset legend="Automatic import" className="flex flex-col gap-4">
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
            variant="white"
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
