import { motion, useReducedMotion } from "motion/react"
import { useRouter } from "next/navigation"

import { ResponsiveSettingsControls } from "@v3/_/components/reader/ResponsiveSettingsControls"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { useVersionBasePath } from "@v3/_/components/version-context"

import { type BookWithRelations } from "@/database/books"
import * as icon from "@/icons"

type Props = {
  book: BookWithRelations
  isVisible: boolean
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
}

export const ReaderHeader = ({
  book,
  isVisible,
  isFullscreen,
  onToggleFullscreen,
}: Props) => {
  const router = useRouter()
  const basePath = useVersionBasePath()
  const reducedMotion = useReducedMotion()

  return (
    <motion.header
      initial={false}
      animate={{ y: isVisible ? 0 : "-100%", opacity: isVisible ? 1 : 0 }}
      transition={
        reducedMotion
          ? { duration: 0 }
          : { type: "spring", stiffness: 500, damping: 45, mass: 0.8 }
      }
      className="bg-reader-bg relative z-20 flex h-12 items-center justify-between px-2"
    >
      <TooltipButton
        variant="real-ghost"
        size="icon-lg"
        tooltip="Back to book"
        aria-label="Back to book"
        tooltipSide="bottom"
        onClick={() => {
          if (window.history.length > 1) {
            router.back()
            return
          }
          router.push(`${basePath}/books/${book.uuid}`)
        }}
        className="text-reader-text hover:bg-reader-surface-hover hover:text-reader-accent-hover focus-visible:ring-reader-accent/40 rounded-full transition-colors"
      >
        <icon.ChevronLeft size="lg" />
      </TooltipButton>

      <div className="flex items-center gap-1">
        <ResponsiveSettingsControls
          book={book}
          context="reader"
          {...(isFullscreen !== undefined && onToggleFullscreen
            ? { isFullscreen, onToggleFullscreen }
            : {})}
        />
      </div>
    </motion.header>
  )
}
