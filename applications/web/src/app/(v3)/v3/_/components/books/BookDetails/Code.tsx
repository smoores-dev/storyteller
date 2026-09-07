export function Code({ code }: { code: string }) {
  return (
    <div className="bg-muted/30 max-h-[60vh] overflow-auto rounded-md border p-3 font-mono text-xs">
      <pre
        dangerouslySetInnerHTML={{ __html: code }}
        className="wrap-break-word whitespace-pre-wrap"
      />
    </div>
  )
}
