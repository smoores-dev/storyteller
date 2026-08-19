import {
  type SidebarGroupInput,
  type SidebarGroupWithItems,
  type SidebarItemDetail,
} from "@/database/sidebar"

type ItemOverride = (
  item: SidebarItemDetail,
  group: SidebarGroupWithItems,
) => Partial<SidebarItemInputFields>

type SidebarItemInputFields = {
  hidden: boolean
}

type GroupOverride = (
  group: SidebarGroupWithItems,
) => Partial<{ hidden: boolean }>

export function toSidebarGroupInputs(
  groups: SidebarGroupWithItems[],
  overrides?: { item?: ItemOverride; group?: GroupOverride },
): SidebarGroupInput[] {
  return groups.map((group) => ({
    uuid: group.uuid,
    name: group.name,
    kind: group.kind,
    hidden: group.hidden,
    ...overrides?.group?.(group),
    items: group.items.map((item) => ({
      kind: item.kind,
      builtinKey: item.builtinKey,
      collectionUuid: item.collectionUuid,
      shelfUuid: item.shelfUuid,
      hidden: item.hidden,
      ...overrides?.item?.(item, group),
    })),
  }))
}
