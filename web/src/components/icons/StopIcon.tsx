type Props = {
  ariaLabel: string
}

export function StopIcon({ ariaLabel }: Props) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      aria-label={ariaLabel}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="3" y="3" width="18" height="18" rx="4" fill="currentColor" />
    </svg>
  )
}
