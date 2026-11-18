import { type ResolvedCtcDevice } from "@storyteller/ghost-story/constants"

export type ServerCapabilities = {
  ctcDevices: {
    available: ResolvedCtcDevice[]
    default: ResolvedCtcDevice
  }
}
