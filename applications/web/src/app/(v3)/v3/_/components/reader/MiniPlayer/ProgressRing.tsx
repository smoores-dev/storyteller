import { cn } from "@v3/_/lib/utils"

export function ProgressRing({
  value,
  size,
  thickness,
  className,
  children,
}: {
  value: number
  size: number
  thickness: number
  className?: string
  children: React.ReactNode
}) {
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.min(Math.max(value, 0), 1)

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        aria-hidden="true"
        className="absolute inset-0 -rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          className="stroke-primary transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      <div
        className="absolute flex items-center justify-center overflow-hidden rounded-full"
        style={{ inset: thickness }}
      >
        {children}
      </div>
    </div>
  )
}
