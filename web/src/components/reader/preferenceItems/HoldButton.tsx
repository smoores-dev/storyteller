import { Tooltip } from "@mantine/core"
import { useCallback, useEffect, useRef, useState } from "react"

import { cn } from "@/cn"

export const HoldButton = ({
  onClick,
  onHold,
  children,
  tooltip,
  holdTooltip,
  className,
  disabled = false,
  ...buttonProps
}: {
  onClick: () => void
  onHold: () => void
  children: React.ReactNode
  tooltip: string
  holdTooltip: string
  className?: string
  disabled?: boolean
} & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick" | "disabled" | "className" | "variant" | "size"
>) => {
  const { isHolding, progress, startHold, endHold } = useHoldButton(onHold)

  return (
    <Tooltip label={isHolding ? holdTooltip : tooltip} position="top" withArrow>
      <button
        {...buttonProps}
        className={cn(className, "relative p-1")}
        disabled={disabled}
        onClick={onClick}
        onMouseDown={startHold}
        onMouseUp={endHold}
        onMouseLeave={endHold}
        onTouchStart={startHold}
        onTouchEnd={endHold}
      >
        {children}

        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
          <div
            className="absolute bottom-0 left-0 right-0 bg-blue-500/30 transition-all duration-75 ease-linear"
            style={{ height: `${progress}%` }}
          />
        </div>
      </button>
    </Tooltip>
  )
}

// hook for hold button functionality with timeout and visual feedback
const useHoldButton = (
  onHold: () => void,
  holdDuration: number = 1500,
  untilHold: number = 500,
) => {
  const [isHolding, setIsHolding] = useState(false)
  const [progress, setProgress] = useState(0)
  const holdTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const startDelayRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number>(0)

  const startHold = useCallback(() => {
    // wait 200ms before actually starting the hold process
    startDelayRef.current = setTimeout(() => {
      setIsHolding(true)
      setProgress(0)
      startTimeRef.current = Date.now()

      // progress update interval
      progressIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current
        const newProgress = Math.min((elapsed / holdDuration) * 100, 100)
        setProgress(newProgress)
      }, 50)

      // hold completion timeout
      holdTimeoutRef.current = setTimeout(() => {
        onHold()
        setIsHolding(false)
        setProgress(0)
      }, holdDuration)
    }, untilHold)
  }, [onHold, holdDuration, untilHold])

  const endHold = useCallback(() => {
    if (startDelayRef.current) {
      clearTimeout(startDelayRef.current)
      startDelayRef.current = null
    }
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current)
      holdTimeoutRef.current = null
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
    setIsHolding(false)
    setProgress(0)
  }, [])

  useEffect(() => {
    return () => {
      if (startDelayRef.current) {
        clearTimeout(startDelayRef.current)
      }
      if (holdTimeoutRef.current) {
        clearTimeout(holdTimeoutRef.current)
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
      }
    }
  }, [])

  return { isHolding, progress, startHold, endHold }
}
