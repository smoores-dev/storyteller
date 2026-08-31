"use client"

import dynamic from "next/dynamic"

import { BookDetailsSkeleton } from "./BookDetailsSkeleton"

export const DynamicBookDetailsContent = dynamic(
  () => import("./BookDetailsPage").then((mod) => mod.BookDetailsContent),
  {
    ssr: false,
    loading: () => <BookDetailsSkeleton compact={true} />,
  },
)
