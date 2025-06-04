import { ReactNode } from "react"

interface Props {
  children: ReactNode
}

export default function MaxwidthLayout({ children }: Props) {
  return <div className="max-w-prose">{children}</div>
}
