import { Anchor, Center, Paper, Stack, Text, Title } from "@mantine/core"
import { type Metadata } from "next"

export const metadata: Metadata = {
  title: "Access Denied",
}

export default function Denied() {
  return (
    <Center className="min-h-screen pb-36">
      <Paper className="w-[450px] p-8">
        <Stack className="items-center gap-4">
          <Title order={1}>Access Denied</Title>
          <Text className="text-center">
            Your account is not authorized to use this service.
          </Text>
          <Anchor href="/login">Return to login</Anchor>
        </Stack>
      </Paper>
    </Center>
  )
}
