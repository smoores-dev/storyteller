import { type ResolvedCtcDevice } from "@storyteller-platform/ghost-story/constants"

export type ServerCapabilities = {
  ctcDevices: {
    available: ResolvedCtcDevice[]
    default: ResolvedCtcDevice
  }
}
