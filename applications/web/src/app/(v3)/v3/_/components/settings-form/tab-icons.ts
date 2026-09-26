import * as icon from "@/icons"
import { type StyledIcon } from "@/icons"

import { type Tab } from "./tabs"

export const TAB_ICONS: Record<Tab, StyledIcon> = {
  files: icon.Folder,
  metadata: icon.Tag,
  processing: icon.Readaloud,
  server: icon.System,
  users: icon.Users,
  maintenance: icon.Tool,
  changelog: icon.History,
  logs: icon.FileText,
  queue: icon.ListNumbers,
  backups: icon.Database,
}
