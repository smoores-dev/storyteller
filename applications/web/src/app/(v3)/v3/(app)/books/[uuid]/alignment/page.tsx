import { type Metadata } from "next"
import { notFound } from "next/navigation"

import { AlignmentReportContent } from "@v3/_/components/books/AlignmentReport/AlignmentReportContent"
import { withPageAuth } from "@v3/_/server/page-auth-wrapper"

import { getBook } from "@/database/books"
import { type UUID } from "@/uuid"

export type AlignmentPageProps = {
  params: Promise<{ uuid: UUID }>
}

export async function generateMetadata({
  params,
}: AlignmentPageProps): Promise<Metadata> {
  const { uuid } = await params
  const book = await getBook(uuid)
  return { title: book ? `Alignment · ${book.title}` : "Alignment report" }
}

export default withPageAuth<AlignmentPageProps>(["bookProcess"])(
  async function AlignmentReportPage({ params }, user) {
    const { uuid } = await params
    const book = await getBook(uuid, user.id)
    if (!book) notFound()

    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <AlignmentReportContent uuid={uuid} />
      </div>
    )
  },
)
