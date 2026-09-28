import { useColorMode } from "@docusaurus/theme-common"
import React, { useEffect, useRef } from "react"

const SCALAR = "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.69.2"

interface ScalarInstance {
  updateConfiguration: (configuration: object) => void
  destroy: () => void
}

declare global {
  interface Window {
    Scalar?: {
      createApiReference: (
        element: Element,
        configuration: object,
      ) => ScalarInstance
    }
  }
}

let loading: Promise<void> | null = null

function loadScalar() {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = SCALAR
    script.onload = () => {
      resolve()
    }
    script.onerror = () => {
      loading = null
      reject(new Error(`Could not load ${SCALAR}`))
    }
    document.head.append(script)
  })
  return loading
}

export interface ApiReferenceProps {
  spec: object
}

export default function ApiReference({ spec }: ApiReferenceProps) {
  const ref = useRef<HTMLDivElement>(null)
  const instance = useRef<ScalarInstance | null>(null)
  const { colorMode } = useColorMode()

  const configuration = {
    content: spec,
    layout: "classic",
    hideDarkModeToggle: true,
    hideClientButton: true,
    withDefaultFonts: false,
    forceDarkModeState: colorMode,
    customCss:
      ".scalar-app { --scalar-font: var(--ifm-font-family-base); --scalar-font-code: var(--ifm-font-family-monospace); background: transparent; }",
  }
  const latest = useRef(configuration)
  latest.current = configuration

  useEffect(() => {
    let cancelled = false
    void loadScalar().then(() => {
      if (cancelled || !ref.current || !window.Scalar) return
      instance.current = window.Scalar.createApiReference(
        ref.current,
        latest.current,
      )
    })
    return () => {
      cancelled = true
      instance.current?.destroy()
      instance.current = null
    }
  }, [spec])

  useEffect(() => {
    instance.current?.updateConfiguration(latest.current)
  }, [colorMode])

  return <div ref={ref} />
}
