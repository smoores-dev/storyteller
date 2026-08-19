"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"

import { useVersionBasePath } from "@v3/_/components/version-context"

export const V3Link = (props: Parameters<typeof Link>[0]) => {
  const basePath = useVersionBasePath()
  const router = useRouter()

  if (typeof props.href === "string") {
    const prefixedHref = props.href.startsWith("/")
      ? `${basePath}${props.href}`
      : props.href

    return (
      <Link
        prefetch={false}
        onPointerEnter={() => {
          router.prefetch(prefixedHref)
        }}
        {...props}
        href={prefixedHref}
      />
    )
  }

  return <Link prefetch={false} {...props} />
}
