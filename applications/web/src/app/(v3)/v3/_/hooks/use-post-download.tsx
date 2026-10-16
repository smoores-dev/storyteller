"use client"

import { useRef, useState } from "react"
import { flushSync } from "react-dom"

/**
 * native form submission so the browser streams the response
 * straight to disk instead of buffering in js memory.
 * accepts a json-serialisable body that gets stuffed into a
 * single hidden input.
 */
export function usePostDownload() {
  const formRef = useRef<HTMLFormElement>(null)
  const [request, setRequest] = useState<{
    action: string
    body: Record<string, unknown>
  } | null>(null)

  function download(action: string, body: Record<string, unknown> = {}) {
    flushSync(() => {
      setRequest({ action, body })
    })

    formRef.current?.submit()
  }

  const form = request && (
    <form ref={formRef} method="post" action={request.action} hidden>
      <input type="hidden" name="json" value={JSON.stringify(request.body)} />
    </form>
  )

  return { download, form }
}
