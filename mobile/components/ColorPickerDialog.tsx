import { useState } from "react"
import {
  ReanimatedLogLevel,
  configureReanimatedLogger,
} from "react-native-reanimated"
import BaseColorPicker, {
  HueSlider,
  InputWidget as BaseInputWidget,
  Panel1,
  Preview,
  Swatches,
} from "reanimated-color-picker"
import { withUniwind } from "uniwind"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import { Text } from "@/components/ui/text"

const ColorPicker = withUniwind(BaseColorPicker)

const InputWidget = withUniwind(BaseInputWidget)

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false, // Reanimated runs in strict mode by default
})

interface Props {
  initialValue: string
  onSave: (value: string) => void
}

export function ColorPickerDialog({ initialValue, onSave }: Props) {
  const [value, setValue] = useState(initialValue)
  return (
    <Dialog className="self-end">
      <DialogTrigger asChild>
        <Button
          className="h-8 w-8 rounded-full border border-white"
          variant="ghost"
          style={{ backgroundColor: value }}
          size="icon"
          onPress={() => {
            onSave(value)
          }}
        />
      </DialogTrigger>
      <DialogContent className="w-screen max-w-100">
        <ColorPicker
          className="m-auto w-62.5 gap-4"
          value={value}
          onChange={(result) => {
            setValue(result.hex)
          }}
        >
          <Preview />
          <Panel1 />
          <HueSlider />
          <Swatches />
          <InputWidget
            iconColorClassName="text-foreground"
            inputClassName="border-secondary text-foreground"
            inputTitleClassName="text-foreground"
          />
        </ColorPicker>
        <Button
          className="self-end"
          onPress={() => {
            onSave(value.slice(0, 7))
          }}
        >
          <Text>Save</Text>
        </Button>
      </DialogContent>
    </Dialog>
  )
}
