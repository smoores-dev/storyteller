import React from "react"
import clsx from "clsx"
import styles from "./styles.module.css"
import Link from "@docusaurus/Link"
import SyncSvg from "@site/static/img/ebook-audiobook-sync.svg"
import DevicesSvg from "@site/static/img/devices.svg"
import LibrarySvg from "@site/static/img/library.svg"

type FeatureItem = {
  title: string
  Svg: React.ComponentType<React.ComponentProps<"svg">>
  description: JSX.Element
}

const FeatureList: FeatureItem[] = [
  {
    title: "Sync your audiobooks and ebooks",
    Svg: SyncSvg,
    description: (
      <>
        Storyteller is a platform for automatically syncing audiobooks and
        ebooks.
      </>
    ),
  },
  {
    title: "Read or listen however you choose",
    Svg: DevicesSvg,
    description: (
      <>
        Storyteller produces EPUB 3 compliant ebook files. You can read them
        with any ebook reader (software or hardware!) that supports EPUB Media
        Overlays, or you can use the dedicated{" "}
        <Link to="/docs/reading-your-books/storyteller-apps">
          Storyteller mobile apps
        </Link>
        .
      </>
    ),
  },
  {
    title: "Own your books",
    Svg: LibrarySvg,
    description: (
      <>
        Storyteller is completely{" "}
        <Link to="/docs/getting-started">self-hosted</Link>. All of your books
        stay on your hardware, and you&apos;re free to move, copy, and back them
        up as needed.
      </>
    ),
  },
]

function Feature({ title, Svg, description }: FeatureItem) {
  return (
    <div className={clsx("col col--4")}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  )
}

export default function HomepageFeatures(): JSX.Element {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  )
}
