import Image from "next/image"
import styles from "./header.module.css"

export function Header() {
  return (
    <header>
      <h1 className={styles["heading"]}>
        <Image
          height={80}
          width={80}
          src="/Storyteller_Logo.png"
          alt=""
          aria-hidden={true}
        />
        Storyteller
      </h1>
    </header>
  )
}
