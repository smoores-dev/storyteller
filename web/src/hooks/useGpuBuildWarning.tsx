"use client"

import { Anchor, Button, Group, Modal, Stack, Text } from "@mantine/core"
import { useCallback, useState } from "react"

import { useGetGpuBuildWarningQuery } from "@/store/api"

const DOCS_URL =
  "https://storyteller-platform.gitlab.io/storyteller/docs/installation/gpu-configuration"

type GuardedAction = (dismiss?: boolean) => void

export function useGpuBuildWarning() {
  const { data } = useGetGpuBuildWarningQuery()
  const [pendingAction, setPendingAction] = useState<GuardedAction | null>(null)

  const guardProcessing = useCallback(
    (action: GuardedAction) => {
      if (!data?.showWarning) {
        action()
        return
      }
      setPendingAction(() => action)
    },
    [data?.showWarning],
  )

  const handleContinue = useCallback(() => {
    pendingAction?.()
    setPendingAction(null)
  }, [pendingAction])

  const handleStop = useCallback(() => {
    setPendingAction(null)
  }, [])

  const handleDismiss = useCallback(() => {
    pendingAction?.(true)
    setPendingAction(null)
  }, [pendingAction])

  const warningModal = (
    <Modal
      opened={pendingAction !== null}
      onClose={handleStop}
      title="GPU acceleration has changed"
      centered
    >
      <Stack gap="md">
        <Text>
          From version 2.7.0 onwards, GPU acceleration is now determined by the
          Docker image tag instead your settings. Your previous transcription
          settings still references a GPU variant, but this container is running
          a CPU-only image.
        </Text>
        <Text>
          To properly use GPU acceleration, switch to the appropriate Docker
          image tag. See the{" "}
          <Anchor href={DOCS_URL} target="_blank">
            self-hosting documentation
          </Anchor>{" "}
          for details.
        </Text>
        <Group justify="space-between">
          <Button variant="subtle" onClick={handleStop}>
            Stop
          </Button>
          <Group gap="xs">
            <Button variant="light" onClick={handleDismiss}>
              Continue and don&apos;t warn again
            </Button>
            <Button onClick={handleContinue}>Continue</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )

  return { guardProcessing, warningModal }
}
