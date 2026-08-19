import { type Metadata } from "next"

import { withPageAuth } from "@v3/_/server/page-auth-wrapper"

import QualityPage from "./qualityPage"

export const metadata: Metadata = {
  title: "Alignment quality",
}

export default withPageAuth(["bookProcess"])(() => {
  return <QualityPage />
})
