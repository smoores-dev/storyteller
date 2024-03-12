"use client"

import Image from "next/image"
import styles from "./header.module.css"
import { useEffect, useRef, useState } from "react"
import { Sidebar } from "./Sidebar"
import { Button } from "@ariakit/react"
import { MenuIcon } from "../icons/MenuIcon"

export function Header() {
  const [showSidebar, setShowSidebar] = useState(false)
  const headerRef = useRef<HTMLHeadingElement | null>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!headerRef.current) return

      const styles = getComputedStyle(headerRef.current)
      if (styles.display === "none") return

      if (e.target instanceof Node && headerRef.current.contains(e.target))
        return

      setShowSidebar(false)
    }

    document.addEventListener("click", onClick)
    return () => {
      document.removeEventListener("click", onClick)
    }
  }, [])

  return (
    <>
      <h1 ref={headerRef} className={styles["heading"]}>
        <span className={styles["storyteller"]}>
          <Image
            height={80}
            width={80}
            src="/Storyteller_Logo.png"
            alt=""
            aria-hidden
          />
          Storyteller
        </span>
        <Button
          className={styles["menu-button"]}
          onClick={() => setShowSidebar(true)}
        >
          <MenuIcon />
        </Button>
      </h1>
      {showSidebar && <Sidebar className={styles["sidebar"]} />}
    </>
  )
}
