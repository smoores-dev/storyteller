import { cn } from "@/cn"
import { renderIdentifierUrl } from "@/database/identifierKinds"
import { type IdentifierKind } from "@/database/identifiers"
import { type ExternalDataRow, knownSource } from "@/externalSource"
import * as icon from "@/icons"

export function RatingValue({
  rating,
  logo,
  color,
}: {
  rating: number
  logo?: string | undefined
  color?: string | null | undefined
}) {
  return (
    <>
      {logo && (
        <img
          src={logo}
          alt=""
          className="h-4 max-w-4 shrink-0 object-contain"
        />
      )}
      <span className="text-muted-foreground text-xs tabular-nums">
        {rating.toFixed(1)}
      </span>
      <icon.Star
        className="size-3.5"
        style={color ? { stroke: color, fill: color } : undefined}
      />
    </>
  )
}

export function ExternalRating({
  externalData,
  siblings,
  className,
}: {
  externalData: ExternalDataRow
  siblings: ReadonlyMap<IdentifierKind, string>
  className?: string
}) {
  const known = knownSource(externalData)
  const color = externalData.sourceColor ?? known?.color
  const url = renderIdentifierUrl(
    { kind: externalData.identifierKind, urlTemplate: null },
    externalData.identifierValue,
    siblings,
  )

  const body = (
    <RatingValue
      rating={externalData.rating}
      logo={known?.logo}
      color={color}
    />
  )

  const classes = cn("flex items-center gap-1.5", className)

  if (!url) {
    return (
      <div className={classes} title={externalData.sourceName}>
        {body}
      </div>
    )
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn(classes, "hover:text-foreground transition-colors")}
      title={externalData.sourceName}
    >
      {body}
    </a>
  )
}
