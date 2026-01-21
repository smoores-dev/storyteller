import Link from "@docusaurus/Link"
import type { Contributor } from "@site/plugins/fetch-contributors"
import React from "react"

import styles from "./styles.module.css"

export default function TeamCard({
  name,
  username,
  avatarUrl,
  gitlabUrl,
}: Pick<Contributor, "name" | "username" | "avatarUrl" | "gitlabUrl">) {
  return (
    <div className={styles.card}>
      {avatarUrl && (
        <img src={avatarUrl} alt={name} className={styles.avatar} />
      )}
      <div className={styles.info}>
        <h3 className={styles.name} title={name}>
          {name}
        </h3>
        {gitlabUrl && username && (
          <Link to={gitlabUrl} className={styles.link}>
            @{username}
          </Link>
        )}
      </div>
    </div>
  )
}
