import dynamic from "next/dynamic"

import { CodeSkeleton } from "./CodeSkeleton"

export const DynamicCode = dynamic(
  () => import("./Code").then((mod) => mod.Code),
  {
    loading: () => <CodeSkeleton />,
    ssr: false,
  },
)
