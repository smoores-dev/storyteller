import FileAuthors from "@site/src/components/FileAuthors"
import type { Props } from "@theme/EditMetaRow"
import EditThisPage from "@theme/EditThisPage"
import clsx from "clsx"
import React from "react"

import styles from "./styles.module.css"

export default function EditMetaRow({ className, editUrl }: Props) {
  return (
    <div className={clsx(styles.row, className)}>
      {editUrl && <EditThisPage editUrl={editUrl} />}
      <FileAuthors />
    </div>
  )
}
