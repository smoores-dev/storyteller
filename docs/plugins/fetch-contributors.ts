import type { LoadContext } from "@docusaurus/types"

import {
  type Contributor,
  gitLabContributors,
} from "../utils/gitlabContributors"

export default function (context: LoadContext) {
  return {
    name: "fetch-contributors-plugin",
    async loadContent(): Promise<Contributor[]> {
      return gitLabContributors
    },
    async contentLoaded({ content, actions }) {
      const { createData, addRoute } = actions

      if (content.length === 0) {
        throw new Error("[fetch-contributors-plugin] No contributors found")
      }

      const contributorsJsonPath = await createData(
        "contributors.json",
        JSON.stringify(content),
      )

      addRoute({
        path: `${context.baseUrl}team`,
        component: "@site/src/pages/_team",
        modules: {
          contributors: contributorsJsonPath,
        },
        exact: true,
      })
    },
  }
}
