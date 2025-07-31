import { InputBase } from "@mantine/core"
import { FocusEventHandler, useLayoutEffect, useRef } from "react"
import cx from "classnames"

interface BaseProps {
  className?: string
  value: string | null
  onChange: (value: string) => void
  onFocus?: FocusEventHandler<HTMLDivElement>
  onBlur?: FocusEventHandler<HTMLDivElement>
}

export function ContentEditableBase({
  className,
  value,
  onChange,
  onFocus,
  onBlur,
}: BaseProps) {
  const initialValue = useRef(value ?? "<p></p>")
  const ref = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = initialValue.current
    }
  }, [])

  return (
    <div
      ref={ref}
      className={cx(className, "h-auto overflow-auto")}
      onInput={(e) => {
        onChange(e.currentTarget.innerHTML)
      }}
      onFocus={onFocus}
      onBlur={onBlur}
      contentEditable
      suppressContentEditableWarning
    />
  )
}

interface Props {
  value: string | null
  onChange: (value: string) => void
  onFocus?: FocusEventHandler<HTMLDivElement>
  onBlur?: FocusEventHandler<HTMLDivElement>
  className?: string
  label?: string | undefined
}

export function ContentEditable(props: Props) {
  return <InputBase {...props} component={ContentEditableBase} />
}
