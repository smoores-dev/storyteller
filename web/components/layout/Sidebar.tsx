"use client"

import Image from "next/image"
import { CircularProgressbar, buildStyles } from "react-circular-progressbar"
import styles from "./sidebar.module.css"
import Link from "next/link"
import cx from "classnames"
import { usePathname } from "next/navigation"
import { usePermissions } from "@/contexts/UserPermissions"
import { useApiClient } from "@/hooks/useApiClient"
import { useEffect, useState } from "react"
import { BookDetail } from "@/apiModels"
import { ProcessingTaskTypes } from "../books/BookStatus"

type Props = {
  className?: string | undefined
}

export function Sidebar({ className }: Props) {
  const client = useApiClient()

  const pathname = usePathname()
  const permissions = usePermissions()

  const [currentBook, setCurrentBook] = useState<BookDetail | null>(null)

  const userFriendlyTaskType =
    currentBook?.processing_status &&
    ProcessingTaskTypes[
      currentBook.processing_status
        .current_task as keyof typeof ProcessingTaskTypes
    ]

  useEffect(() => {
    async function findCurrentBook() {
      const books = await client.listBooks()

      const currentBook =
        books.find(
          (book) =>
            book.processing_status?.current_task &&
            book.processing_status.progress !== 1 &&
            !book.processing_status.in_error,
        ) ?? null

      setCurrentBook(currentBook)
    }

    findCurrentBook()
    setInterval(() => {
      findCurrentBook()
    }, 5000)
  }, [client])

  return (
    <aside className={cx(styles["aside"], className)}>
      <h1 className={styles["heading"]}>
        <Image
          height={80}
          width={80}
          src="/Storyteller_Logo.png"
          alt=""
          aria-hidden
        />
        Storyteller
      </h1>
      <section className={styles["in-progress"]}>
        {currentBook ? (
          <>
            <Image
              height={98}
              width={64}
              src={client.getCoverUrl(currentBook.uuid)}
              alt=""
              aria-hidden
            />
            <div className={styles["in-progress-details"]}>
              <h3 className={styles["in-progress-title"]}>
                {currentBook.title}
              </h3>
              <div className={styles["in-progress-status"]}>
                <CircularProgressbar
                  className={styles["progress-bar"]}
                  value={currentBook.processing_status!.progress}
                  maxValue={1}
                  styles={buildStyles({
                    pathColor: "white",
                    trailColor: "#855",
                  })}
                />
                <p>{userFriendlyTaskType}</p>
              </div>
            </div>
          </>
        ) : (
          "All synced!"
        )}
      </section>
      <nav className={styles["nav"]}>
        <ol>
          {(permissions.book_list || permissions.book_create) && (
            <li className={cx({ [styles["active"]!]: pathname === "/" })}>
              <Link className={styles["nav-link"]} href="/">
                Books
              </Link>
            </li>
          )}
          {(permissions.user_create || permissions.user_list) && (
            <li className={cx({ [styles["active"]!]: pathname === "/users" })}>
              <Link className={styles["nav-link"]} href="/users">
                Users
              </Link>
            </li>
          )}
          {permissions.settings_update && (
            <li
              className={cx({ [styles["active"]!]: pathname === "/settings" })}
            >
              <Link className={styles["nav-link"]} href="/settings">
                Settings
              </Link>
            </li>
          )}
          <li className={cx({ [styles["active"]!]: pathname === "/logout" })}>
            <Link className={styles["nav-link"]} href="/logout">
              Logout
            </Link>
          </li>
        </ol>
      </nav>
    </aside>
  )
}
