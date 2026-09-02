import { type Hotkey } from "@tanstack/react-hotkeys"
import { useCallback, useEffect, useRef, useState } from "react"

import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { cn } from "@v3/_/lib/utils"

export const HoldButton = ({
  onClick,
  onHold,
  children,
  tooltip,
  holdTooltip,
  shortcut,
  className,
  disabled = false,
  ...buttonProps
}: {
  onClick: () => void
  onHold: () => void
  children: React.ReactNode
  tooltip: string
  holdTooltip: string
  shortcut?: Hotkey[]
  className?: string
  disabled?: boolean
} & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick" | "disabled" | "className"
>) => {
  const { isHolding, progress, startHold, endHold } = useHoldButton(onHold)

  const tooltipContent = isHolding ? holdTooltip : tooltip
  return (
    <TooltipButton
      variant="real-ghost"
      size="icon-lg"
      tooltip={tooltipContent}
      aria-label={tooltipContent}
      {...(shortcut && !isHolding ? { shortcut } : {})}
      {...buttonProps}
      className={cn("relative overflow-hidden", className)}
      disabled={disabled}
      onClick={onClick}
      onMouseDown={startHold}
      onMouseUp={endHold}
      onMouseLeave={endHold}
      onTouchStart={startHold}
      onTouchEnd={endHold}
    >
      {children}

      <div
        aria-hidden
        className="bg-reader-accent/30 pointer-events-none absolute right-0 bottom-0 left-0 transition-[height] duration-75 ease-linear"
        style={{ height: `${progress}%` }}
      />
    </TooltipButton>
  )
}

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
    startDelayRef.current = setTimeout(() => {
      setIsHolding(true)
      setProgress(0)
      startTimeRef.current = Date.now()

      progressIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current
        setProgress(Math.min((elapsed / holdDuration) * 100, 100))
      }, 50)

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
