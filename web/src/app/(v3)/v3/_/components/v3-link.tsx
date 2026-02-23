import Link from "next/link"

export const V3Link = (props: Parameters<typeof Link>[0]) => {
  if (typeof props.href === "string") {
    const v3dHref = props.href.startsWith("/")
      ? `/v3${props.href}`
      : `/${props.href}`
    return <Link {...props} href={v3dHref} />
  }

  return <Link {...props} />
}
