"use client"

import Image from "next/image"
import styles from "./sidebar.module.css"
import Link from "next/link"
import cx from "classnames"
import { usePathname } from "next/navigation"
import { usePermissions } from "@/contexts/UserPermissions"

export function Sidebar() {
  const pathname = usePathname()
  const permissions = usePermissions()

  return (
    <aside className={styles["aside"]}>
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
        <Image
          height={98}
          width={64}
          src="/api/books/8ca5dac3-e3f2-4e8b-b77d-dcf53bf5f135/cover"
          alt=""
          aria-hidden
        />
        <div className={styles["in-progress-details"]}>
          <h3 className={styles["in-progress-title"]}>The Sunlit Man</h3>
          <div className={styles["in-progress-status"]}>
            <p>0</p>
            <p>Transcribing</p>
          </div>
        </div>
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
