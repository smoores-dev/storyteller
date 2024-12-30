import { Text, Tooltip } from "@mantine/core"
import { IconHelpCircle } from "@tabler/icons-react"

export function ProcessingFailedMessage() {
  return (
    <>
      {" "}
      &mdash;{" "}
      <Tooltip
        position="bottom"
        label="Check the server logs to determine the source of the issue."
      >
        <Text className="inline-flex cursor-help items-center gap-1 text-red-600">
          <Text>Failed</Text> <IconHelpCircle className="h-4 w-4" />
        </Text>
      </Tooltip>
    </>
  )
}
