import styles from "./processingitems.module.css"
import { BookDetail } from "@/apiModels"
import cx from "classnames"

import {
  TooltipProvider,
  Tooltip,
  TooltipAnchor,
  MenuItem,
  Menu,
  MenuProvider,
  MenuButton,
} from "@ariakit/react"
import { HardRestartIcon } from "../icons/HardRestartIcon"
import { SoftRestartIcon } from "../icons/SoftRestartIcon"
import { StopIcon } from "../icons/StopIcon"
import { useApiClient } from "@/hooks/useApiClient"
import { DeleteIcon } from "../icons/DeleteIcon"

type Props = {
  book: BookDetail
  synchronized: boolean
}

export function ProcessingItems({ book, synchronized }: Props) {
  const client = useApiClient()

  if (
    !book.processing_status?.is_processing &&
    !book.processing_status?.is_queued
  ) {
    return (
      <MenuProvider placement="left-start">
        <MenuButton className={styles["popover-anchor"]} render={<MenuItem />}>
          <TooltipProvider placement="right">
            <TooltipAnchor>
              <SoftRestartIcon ariaLabel="Processing" />
            </TooltipAnchor>
            <Tooltip>Processing</Tooltip>
          </TooltipProvider>
        </MenuButton>
        <Menu gutter={12} className={styles["menu"]}>
          <MenuItem
            className={styles["menu-item"]}
            onClick={() => client.processBook(book.uuid, false)}
          >
            <SoftRestartIcon aria-hidden />{" "}
            {synchronized ? "Re-process (using cached files)" : "Continue"}
          </MenuItem>
          <MenuItem
            className={styles["menu-item"]}
            onClick={() => client.processBook(book.uuid, true)}
          >
            <HardRestartIcon aria-hidden /> Delete cache and re-process from
            source files
          </MenuItem>
          <MenuItem
            className={styles["menu-item"]}
            onClick={() => client.deleteBookAssets(book.uuid)}
          >
            <DeleteIcon aria-hidden /> Delete cache files
          </MenuItem>
          {synchronized ? (
            <MenuItem
              className={cx(styles["menu-item"], styles["delete"])}
              onClick={() => client.deleteBookAssets(book.uuid, true)}
            >
              <DeleteIcon aria-hidden /> Delete source and cache files
            </MenuItem>
          ) : (
            <TooltipProvider>
              <TooltipAnchor
                render={<MenuItem />}
                className={cx(
                  styles["menu-item"],
                  styles["delete"],
                  styles["disabled"],
                )}
                onClick={(e) => {
                  e.preventDefault()
                }}
              >
                <DeleteIcon aria-hidden /> Delete source and cache files
              </TooltipAnchor>
              <Tooltip className={styles["tooltip"]}>
                You can&apos;t delete source files until the book has been
                synced successfully
              </Tooltip>
            </TooltipProvider>
          )}
        </Menu>
      </MenuProvider>
    )
  }

  return (
    <MenuItem
      className={cx(styles["menu-item"], styles["delete"])}
      onClick={() => client.cancelProcessing(book.uuid)}
    >
      <TooltipProvider placement="right">
        <TooltipAnchor>
          <StopIcon
            ariaLabel={
              book.processing_status.is_queued
                ? "Remove from queue"
                : "Stop processing"
            }
          />
        </TooltipAnchor>
        <Tooltip>
          {book.processing_status.is_queued
            ? "Remove from queue"
            : "Stop processing"}
        </Tooltip>
      </TooltipProvider>
    </MenuItem>
  )
}
