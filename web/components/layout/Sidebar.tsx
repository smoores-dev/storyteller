import Image from "next/image"
import styles from "./sidebar.module.css"
import Link from "next/link"

export function Sidebar() {
  return (
    <aside className={styles.aside}>
      <h1 className={styles.heading}>
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
      <nav className={styles.nav}>
        <ol>
          <li className={styles.active}>
            <Link href="/">Books</Link>
          </li>
          <li>
            <Link href="/users">Users</Link>
          </li>
          <li>
            <Link href="/settings">Settings</Link>
          </li>
        </ol>
      </nav>
    </aside>
  )
}
