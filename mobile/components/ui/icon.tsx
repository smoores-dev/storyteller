import type { LucideIcon, LucideProps } from "lucide-react-native"
import { withUniwind } from "uniwind"

import { cn } from "@/lib/utils"

type IconProps = LucideProps & {
  as: LucideIcon
}

function BaseIconImpl({ as: IconComponent, ...props }: IconProps) {
  return <IconComponent {...props} />
}

const IconImpl = withUniwind(BaseIconImpl, {
  color: {
    fromClassName: "className",
    styleProperty: "color",
  },
})

/**
 * A wrapper component for Lucide icons with Nativewind `className` support via `withUniwind`.
 *
 * This component allows you to render any Lucide icon while applying utility classes
 * using `nativewind`. It avoids the need to wrap or configure each icon individually.
 *
 * @component
 * @example
 * ```tsx
 * import { ArrowRight } from 'lucide-react-native';
 * import { Icon } from '@/registry/components/ui/icon';
 *
 * <Icon as={ArrowRight} className="text-red-500" size={16} />
 * ```
 *
 * @param {LucideIcon} as - The Lucide icon component to render.
 * @param {string} className - Utility classes to style the icon using Nativewind.
 * @param {number} size - Icon size (defaults to 14).
 * @param {...LucideProps} ...props - Additional Lucide icon props passed to the "as" icon.
 */
function Icon({
  as: IconComponent,
  className,
  size = 14,
  ...props
}: IconProps) {
  return (
    <IconImpl
      as={IconComponent}
      className={cn("text-foreground", className)}
      size={size}
      {...props}
    />
  )
}

export { Icon }
