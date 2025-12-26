import { PortalHost as PortalHostPrimitive } from "@rn-primitives/portal"
import { type ReactNode, createContext, useRef } from "react"

import { randomUUID } from "@/uuid"

export const PortalContext = createContext<string>(null as unknown as string)

export function PortalHost({ children }: { children: ReactNode }) {
  const portalHostName = useRef(randomUUID()).current

  return (
    <PortalContext value={portalHostName}>
      {children}
      <PortalHostPrimitive name={portalHostName} />
    </PortalContext>
  )
}
