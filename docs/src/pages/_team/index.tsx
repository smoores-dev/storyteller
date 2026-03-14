import Link from "@docusaurus/Link"
import TeamCard from "@site/src/components/TeamCard"
import type { Contributor } from "@site/utils/gitlabContributors"
import Layout from "@theme/Layout"
import React from "react"

import styles from "./index.module.css"

type Contributors = {
  contributors: Contributor[]
}

export default function Team({ contributors }: Contributors) {
  return (
    <Layout>
      <header className={styles.header}>
        <div className="container">
          <h1 className={styles.title}>Meet the Team</h1>
          <p className={styles.subtitle}>
            Interested in contributing? Check out the{" "}
            <Link to="/contributing/contributing-overview">
              Contributing Guide
            </Link>{" "}
            to get started.
          </p>
        </div>
      </header>
      <main className="container">
        <div className={styles.grid}>
          {contributors.map((member) => (
            <TeamCard
              key={member.username}
              name={member.name}
              username={member.username}
              avatarUrl={member.avatarUrl}
              gitlabUrl={member.gitlabUrl}
            />
          ))}
        </div>
      </main>
    </Layout>
  )
}
