import styles from "./progressbar.module.css"

type Props = {
  progress: number
}

export function ProgressBar({ progress }: Props) {
  return (
    <div className={styles["bar"]}>
      <div
        className={styles["progress"]}
        style={{ width: `${progress}%` }}
      ></div>
    </div>
  )
}
