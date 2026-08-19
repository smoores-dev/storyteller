export function FilePathRow({
  label,
  filepath,
}: {
  label: string
  filepath: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground font-sans text-xs uppercase">
          {label}
        </span>
      </div>

      <div className="text-sm" title={filepath}>
        <span className="break-all">{filepath}</span>
      </div>
    </div>
  )
}
