"use client"

import { PlayButton } from "@v3/_/components/audio"
import { Button } from "@v3/_/components/ui/button"
import { Checkbox } from "@v3/_/components/ui/checkbox"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { type ReportStripFile } from "@/alignmentReportView"
import { formatTime } from "@/components/reader/preferenceItems/formatTime"
import * as icon from "@/icons"
import { useGetTranscodedAudioQuery } from "@/store/api"
import type { UUID } from "@/uuid"

import { FlagBadge, type IgnoreEditor } from "./shared"
import { AudioChunk } from "@/schemas/v2/alignmentReport"

export function LooseAudio({
  bookUuid,
  files,
  selected,
  onSelect,
  ignore,
}: {
  bookUuid: UUID
  files: [string, AudioChunk[]][]
  selected: ReadonlySet<string>
  onSelect: (key: string, order: readonly string[], extend: boolean) => void
  ignore: IgnoreEditor
}) {
  const t = useTranslation("AlignmentReport")
  const { data: transcoded } = useGetTranscodedAudioQuery({ uuid: bookUuid })

  if (files.length === 0) {
    return null
  }

  // const order = files.map((file) => file.filepath)

  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-1.5 text-lg font-normal">
        <icon.Headphones className="size-4" />
        {t("loose.title")}{" "}
        <span className="text-muted-foreground font-mono text-xs">
          ({files.length})
        </span>
      </h2>
      <div className="divide-border divide-y overflow-hidden rounded-lg border">
        {files.map(([name, chunks]) => {
          const disk = transcoded?.find((entry) => entry.name === name)

          return (
            <div key={name}>
              {chunks.map((chunk) => {
                return (
                  <div key={chunk.filepath}>
                    <span>
                      {chunk.name} from {chunk.start} to {chunk.end} (of{" "}
                      {chunk.totalDuration})
                    </span>
                  </div>
                )
              })}
            </div>
          )

          // const seconds = file.duration ?? disk?.duration ?? null
          // const missing = disk?.present === false
          // const between =
          //   file.between.before !== null && file.between.after !== null
          //     ? t("loose.between", {
          //         before: file.between.before,
          //         after: file.between.after,
          //       })
          //     : file.between.after !== null
          //       ? t("loose.beforeFirst", { label: file.between.after })
          //       : file.between.before !== null
          //         ? t("loose.afterLast", { label: file.between.before })
          //         : null

          // return (
          //   <div
          //     key={file.filepath}
          //     className={cn(
          //       "flex items-center gap-2 px-2 py-1.5",
          //       file.ignored && "opacity-50",
          //     )}
          //   >
          //     <div
          //       onClick={(event) => {
          //         onSelect(file.filepath, order, event.shiftKey)
          //       }}
          //     >
          //       <Checkbox
          //         checked={selected.has(file.filepath)}
          //         aria-label={file.name}
          //         onCheckedChange={() => undefined}
          //       />
          //     </div>
          //     <PlayButton
          //       clip={{
          //         bookUuid,
          //         path: file.filepath,
          //         name: file.filepath,
          //         label: file.name,
          //       }}
          //     />
          //     <span className="truncate font-mono text-xs">{file.name}</span>
          //     {between !== null && (
          //       <span className="text-muted-foreground truncate text-xs">
          //         {between}
          //       </span>
          //     )}
          //     <span className="text-muted-foreground ml-auto shrink-0 font-mono text-[11px] tabular-nums">
          //       {seconds !== null ? formatTime(seconds, true) : "—"}
          //     </span>
          //     {missing && (
          //       <FlagBadge tone="poor">{t("loose.notOnDisk")}</FlagBadge>
          //     )}
          //     <Button
          //       variant={file.ignored ? "secondary" : "ghost"}
          //       size="sm"
          //       onClick={() => {
          //         ignore([file.filepath], !file.ignored)
          //       }}
          //     >
          //       {file.ignored ? t("actions.unignore") : t("actions.ignore")}
          //     </Button>
          //   </div>
          // )
        })}
      </div>
    </section>
  )
}
