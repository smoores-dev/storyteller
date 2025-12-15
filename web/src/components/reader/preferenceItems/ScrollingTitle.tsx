import { useEffect, useRef, useState } from "react"

import { cn } from "@/cn"

type ScrollingTitleProps = {
  children: React.ReactNode
  className?: string
  scrollSpeed?: number
  scrollInterval?: number
  fadeWidth?: number
}

export const ScrollingTitle = ({
  children,
  className,
  scrollSpeed = 30,
  scrollInterval = 20000,
}: ScrollingTitleProps) => {
  const titleRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const [scrollDirection, setScrollDirection] = useState<
    "none" | "forward" | "backward"
  >("none")
  const [scrollDuration, setScrollDuration] = useState(4000)

  useEffect(() => {
    const abortController = new AbortController()
    const checkOverflow = () => {
      if (!titleRef.current || !containerRef.current) return

      const element = titleRef.current
      const container = containerRef.current
      const isOverflow = element.scrollWidth > container.clientWidth

      setIsOverflowing(isOverflow)

      if (isOverflow) {
        const distance = element.scrollWidth - container.clientWidth
        const duration = (distance / scrollSpeed) * 1000
        setScrollDuration(duration)
      }
    }

    checkOverflow()
    window.addEventListener("resize", checkOverflow, {
      signal: abortController.signal,
    })
    return () => {
      abortController.abort()
    }
  }, [children, scrollSpeed])

  useEffect(() => {
    if (!isOverflowing) return

    const scrollIntervalId = setInterval(
      async () => {
        setScrollDirection("forward")

        await new Promise<void>((resolve) =>
          setTimeout(resolve, scrollDuration + 1000),
        )

        setScrollDirection("backward")
        await new Promise<void>((resolve) =>
          setTimeout(resolve, scrollDuration),
        )

        setScrollDirection("none")
      },
      scrollDuration + 1000 + scrollDuration + scrollInterval,
    )

    return () => {
      clearInterval(scrollIntervalId)
    }
  }, [isOverflowing, scrollInterval, scrollDuration])

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        style={{
          marginInlineStart: "-6px",
          overflow: "hidden",
          maskImage: isOverflowing
            ? `linear-gradient(to right, transparent, black 8px, black calc(100% - 8px), transparent)`
            : undefined,
        }}
      >
        <div
          ref={titleRef}
          className={cn(
            "relative whitespace-nowrap transition-[left] motion-reduce:!left-0",
            className,
          )}
          style={{
            transitionTimingFunction: "cubic-bezier(0.0, 0, 0.8, 1)",
            transitionDuration: `${scrollDuration}ms`,
            left:
              scrollDirection === "forward" && isOverflowing
                ? `calc(100% - ${(titleRef.current?.scrollWidth ?? 0) + 6}px)`
                : "6px",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
