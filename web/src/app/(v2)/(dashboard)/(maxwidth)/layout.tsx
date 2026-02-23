import { type ReactNode } from "react"

interface Props {
  children: ReactNode
}

export default function MaxwidthLayout({ children }: Props) {
  return <div className="max-w-[95ch]">{children}</div>
}
