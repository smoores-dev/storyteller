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
import {
  ProcessingTaskStatus,
  ProcessingTaskType,
} from "@/apiModels/models/ProcessingStatus"
import { BookEvent } from "@/events"

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
    void client.listBooks().then((books) => {
      const currentBook = books.find(
        (book) => book.processing_status?.is_processing,
      )
      if (currentBook) setCurrentBook(currentBook)
    })

    const eventSource = new EventSource("/api/books/events")

    eventSource.addEventListener("message", (event: MessageEvent<string>) => {
      const data = JSON.parse(event.data) as BookEvent
      switch (data.type) {
        case "processingCompleted":
        case "processingFailed":
        case "processingStopped": {
          setCurrentBook(null)
          break
        }
        case "taskProgressUpdated": {
          setCurrentBook(
            (book) =>
              book && {
                ...book,
                processing_status: {
                  is_processing: true,
                  is_queued: false,
                  current_task:
                    book.processing_status?.current_task ??
                    ProcessingTaskType.SPLIT_CHAPTERS,
                  progress: data.payload.progress,
                  status: ProcessingTaskStatus.STARTED,
                },
              },
          )
          break
        }
        case "taskTypeUpdated": {
          setCurrentBook(
            (book) =>
              book && {
                ...book,
                processing_status: {
                  is_processing: true,
                  is_queued: false,
                  current_task: data.payload.taskType,
                  progress: 0,
                  status: ProcessingTaskStatus.STARTED,
                },
              },
          )
          break
        }
        case "processingStarted": {
          void client.getBookDetails(data.bookUuid).then((book) => {
            if (book.processing_status?.is_processing) {
              setCurrentBook(book)
            }
          })
        }
      }
    })

    return () => {
      eventSource.close()
    }
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
                  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
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
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            <li className={cx({ [styles["active"]!]: pathname === "/" })}>
              <Link className={styles["nav-link"]} href="/">
                Books
              </Link>
            </li>
          )}
          {(permissions.user_create || permissions.user_list) && (
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            <li className={cx({ [styles["active"]!]: pathname === "/users" })}>
              <Link className={styles["nav-link"]} href="/users">
                Users
              </Link>
            </li>
          )}
          {permissions.settings_update && (
            <li
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              className={cx({ [styles["active"]!]: pathname === "/settings" })}
            >
              <Link className={styles["nav-link"]} href="/settings">
                Settings
              </Link>
            </li>
          )}
          {/* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */}
          <li className={cx({ [styles["active"]!]: pathname === "/logout" })}>
            <a className={styles["nav-link"]} href="/logout">
              Logout
            </a>
          </li>
        </ol>
      </nav>
    </aside>
  )
}
