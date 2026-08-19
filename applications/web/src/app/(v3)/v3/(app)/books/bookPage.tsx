"use client"

import { AddBookButton } from "@v3/_/components/AddBookButton"
import { BookListPage } from "@v3/_/components/books/BookListPage"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { type UserPermissionSet } from "@/database/users"

export default function BookPage({
  permissions: _permissions,
}: {
  permissions: UserPermissionSet
}) {
  const t = useTranslation("BooksPage")

  return (
    <BookListPage
      source={{ kind: "books" }}
      breadcrumbs={[
        {
          render: (
            <h1 className="font-heading text-foreground truncate text-2xl font-normal">
              {t("title")}
            </h1>
          ),
        },
      ]}
      headerActions={<AddBookButton />}
      enableBookStepping
      emptyFilteredSubMessage="Try adjusting your search or filters"
    />
  )
}
