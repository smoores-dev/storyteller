import { useDoc } from "@docusaurus/plugin-content-docs/client"
import { type Author } from "@site/utils/getFileAuthors"
import React from "react"

import styles from "./styles.module.css"

export default function FileAuthors() {
  const { frontMatter } = useDoc()
  const authors: Author[] =
    ((frontMatter as Record<string, unknown>).fileAuthors as Author[]) ?? []
  const totalAuthors = authors.length

  if (totalAuthors === 0) {
    return null
  }

  return (
    <div className={styles.authors}>
      <span className={styles.label}>
        {totalAuthors} Contributor{totalAuthors !== 1 ? "s" : ""}
      </span>
      <div className={styles.avatars}>
        {authors.map((author, i) => (
          <a
            key={author.username}
            href={author.commitUrl}
            className={styles.avatarLink}
            style={{ zIndex: authors.length - i }}
          >
            <img
              src={author.avatarUrl}
              alt={author.name}
              className={styles.avatar}
            />
          </a>
        ))}
      </div>
    </div>
  )
}
