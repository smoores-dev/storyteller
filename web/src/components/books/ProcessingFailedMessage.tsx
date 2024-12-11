import styles from "./processingfailedmessage.module.css"
import { HelpIcon } from "../icons/HelpIcon"
import { Tooltip, TooltipAnchor, TooltipProvider } from "@ariakit/react"

export function ProcessingFailedMessage() {
  return (
    <TooltipProvider placement="bottom">
      {" "}
      &mdash;{" "}
      <TooltipAnchor
        render={
          <span className={styles["failed"]}>
            <span>Failed</span> <HelpIcon className={styles["help-icon"]} />
          </span>
        }
      ></TooltipAnchor>
      <Tooltip className={styles["tooltip"]}>
        Check the server logs to determine the source of the issue.
      </Tooltip>
    </TooltipProvider>
  )
}
