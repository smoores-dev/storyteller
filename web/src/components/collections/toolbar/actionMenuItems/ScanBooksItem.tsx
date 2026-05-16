import { MenuItem } from "@mantine/core"
import { IconSearch } from "@tabler/icons-react"

import { useScanBooksMutation } from "@/store/api"
import { type UUID } from "@/uuid"

interface Props {
  selected: Set<UUID>
}

export function ScanBooksItem({ selected }: Props) {
  const [scanBooks, { isLoading }] = useScanBooksMutation()

  return (
    <MenuItem
      leftSection={<IconSearch size={14} />}
      disabled={isLoading}
      onClick={() => {
        void scanBooks({ bookUuids: [...selected], force: true })
      }}
    >
      {isLoading ? "Scanning..." : "Scan selected books"}
    </MenuItem>
  )
}
