import useDocusaurusContext from "@docusaurus/useDocusaurusContext"
import { usePluginData } from "@docusaurus/useGlobalData"
import React from "react"

import type { StudioConfig } from "../core/config"
import { EMPTY_OUTLINE, type SidebarOutline } from "../core/model/outline"
import { Studio } from "../core/ui/Studio"

import "../core/ui/studio.css"

import { docusaurusAdapter } from "./adapter"

import "./theme.css"

export default function StudioPage() {
  const { siteConfig } = useDocusaurusContext()
  const config = siteConfig.customFields?.studio as StudioConfig | undefined
  const outline =
    (usePluginData("studio-sidebar") as SidebarOutline | undefined) ??
    EMPTY_OUTLINE
  if (!config) {
    return <p>The docs studio is not configured for this site.</p>
  }
  return (
    <Studio config={config} adapter={docusaurusAdapter} outline={outline} />
  )
}
