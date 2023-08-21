import styles from "./bookoptions.module.css"
import { BookDetail } from "@/apiModels"
import { useApiClient } from "@/hooks/useApiClient"
import { Menu, MenuButton, MenuItem, useMenuStore } from "@ariakit/react"
import { MoreVerticalIcon } from "../icons/MoreVerticalIcon"

type Props = {
  book: BookDetail
  onUpdate: () => void
}

export function BookOptions({ book, onUpdate }: Props) {
  const client = useApiClient()
  const menuStore = useMenuStore()
  return (
    <>
      <MenuButton store={menuStore} className={styles["button"]}>
        <MoreVerticalIcon className={styles["icon"]} />
      </MenuButton>
      <Menu store={menuStore} gutter={8} className={styles["menu"]}>
        <MenuItem
          className={styles["menu-item"]}
          onClick={() =>
            client.processBook(book.id, true).then(() => onUpdate())
          }
        >
          Re-process
        </MenuItem>
      </Menu>
    </>
  )
}
