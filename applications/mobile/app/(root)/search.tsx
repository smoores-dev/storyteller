import { useState } from "react"

import { BookGrid } from "@/components/BookGrid"
import { Input } from "@/components/ui/input"
import { useBookSearch } from "@/hooks/useBookSearch"

export default function SearchScreen() {
  const [search, setSearch] = useState("")

  const results = useBookSearch(search)

  return (
    <BookGrid
      title="Search"
      books={results}
      refreshable={false}
      header={
        <Input
          className="mx-safe-or-4 mb-2 w-auto"
          accessibilityLabel="Search books"
          autoFocus
          maxFontSizeMultiplier={2}
          value={search}
          onChangeText={setSearch}
          placeholder="Search"
          returnKeyType="search"
        />
      }
    />
  )
}
