import { useEffect, useRef, useState } from "react"

import { cn } from "@v3/_/lib/utils"

type ScrollingTitleProps = {
  children: React.ReactNode
  className?: string
  scrollSpeed?: number
  scrollInterval?: number
}

export const ScrollingTitle = ({
  children,
  className,
  scrollSpeed = 30,
  scrollInterval = 20000,
}: ScrollingTitleProps) => {
  const titleRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollDistance, setScrollDistance] = useState(0)
  const [scrollDirection, setScrollDirection] = useState<
    "none" | "forward" | "backward"
  >("none")

  const isOverflowing = scrollDistance > 20
  const scrollDuration = (scrollDistance / scrollSpeed) * 1000

  useEffect(() => {
    const abortController = new AbortController()
    const checkOverflow = () => {
      if (!titleRef.current || !containerRef.current) return
      setScrollDistance(
        titleRef.current.scrollWidth - containerRef.current.clientWidth,
      )
    }

    checkOverflow()
    window.addEventListener("resize", checkOverflow, {
      signal: abortController.signal,
    })
    return () => {
      abortController.abort()
    }
  }, [children])

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
        className="-ms-1.5 overflow-hidden"
        style={{
          maskImage: isOverflowing
            ? "linear-gradient(to right, transparent, black 8px, black calc(100% - 8px), transparent)"
            : undefined,
        }}
      >
        <div
          ref={titleRef}
          className={cn(
            "relative w-max whitespace-nowrap transition-transform will-change-transform motion-reduce:transform-none! motion-reduce:transition-none",
            className,
          )}
          style={{
            transitionTimingFunction: "cubic-bezier(0.0, 0, 0.8, 1)",
            transitionDuration: `${scrollDuration}ms`,
            transform:
              scrollDirection === "forward" && isOverflowing
                ? `translateX(${-scrollDistance - 6}px)`
                : "translateX(6px)",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
