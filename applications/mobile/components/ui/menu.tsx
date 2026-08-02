import {
  type MenuAction as ExpoMenuAction,
  MenuView,
} from "@expo/ui/community/menu"

import { type MenuAction, type MenuProps } from "./menu.types"

export type { MenuAction, MenuRef } from "./menu.types"

function stripCallbacks(action: MenuAction): ExpoMenuAction {
  const { onPress: _onPress, subactions, ...menuAction } = action
  return {
    ...menuAction,
    ...(subactions ? { subactions: subactions.map(stripCallbacks) } : {}),
  }
}

function collectCallbacks(
  action: MenuAction,
  callbacks: Map<string, () => void>,
) {
  const id = action.id ?? action.title
  if (action.onPress) callbacks.set(id, action.onPress)
  action.subactions?.forEach((subaction) =>
    collectCallbacks(subaction, callbacks),
  )
}

export function Menu({ actions, menuRef, ...props }: MenuProps) {
  const menuActions = actions.map(stripCallbacks)
  const callbacks = new Map<string, () => void>()
  actions.forEach((action) => collectCallbacks(action, callbacks))
  const refProps = menuRef ? { ref: menuRef } : {}

  return (
    <MenuView
      {...refProps}
      actions={menuActions}
      onPressAction={(event) => {
        callbacks.get(event.nativeEvent.event)?.()
      }}
      {...props}
    />
  )
}
