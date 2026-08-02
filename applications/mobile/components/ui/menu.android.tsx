import { type TriggerRef } from "@rn-primitives/dropdown-menu"
import { useImperativeHandle, useRef } from "react"
import { Image } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Text } from "@/components/ui/text"

import { type MenuAction, type MenuProps } from "./menu.types"

export type { MenuAction, MenuRef } from "./menu.types"

function actionId(action: MenuAction): string {
  return action.id ?? action.title
}

function ActionImage({ action }: { action: MenuAction }) {
  if (typeof action.image === "string" || action.image == null) return null

  return (
    <Image
      source={action.image}
      style={{
        height: 16,
        width: 16,
        ...(action.imageColor == null ? {} : { tintColor: action.imageColor }),
      }}
    />
  )
}

function ActionTitle({ action }: { action: MenuAction }) {
  return (
    <Text style={action.titleColor ? { color: action.titleColor } : undefined}>
      {action.title}
    </Text>
  )
}

function DropdownAction({ action }: { action: MenuAction }) {
  if (action.attributes?.hidden) return null

  if (action.subactions?.length) {
    if (action.displayInline) {
      return (
        <>
          <DropdownMenuSeparator />
          {action.subactions.map((subaction) => (
            <DropdownAction key={actionId(subaction)} action={subaction} />
          ))}
          <DropdownMenuSeparator />
        </>
      )
    }

    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger
          disabled={action.attributes?.disabled}
          textValue={action.title}
        >
          <ActionImage action={action} />
          <ActionTitle action={action} />
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {action.subactions.map((subaction) => (
            <DropdownAction key={actionId(subaction)} action={subaction} />
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    )
  }

  return (
    <DropdownMenuItem
      disabled={action.attributes?.disabled}
      onPress={action.onPress}
      textValue={action.title}
      variant={action.attributes?.destructive ? "destructive" : "default"}
    >
      <ActionImage action={action} />
      <ActionTitle action={action} />
      {action.state === "on" && <Text className="ml-auto">{"\u2713"}</Text>}
    </DropdownMenuItem>
  )
}

function ContextAction({ action }: { action: MenuAction }) {
  if (action.attributes?.hidden) return null

  if (action.subactions?.length) {
    if (action.displayInline) {
      return (
        <>
          <ContextMenuSeparator />
          {action.subactions.map((subaction) => (
            <ContextAction key={actionId(subaction)} action={subaction} />
          ))}
          <ContextMenuSeparator />
        </>
      )
    }

    return (
      <ContextMenuSub>
        <ContextMenuSubTrigger
          disabled={action.attributes?.disabled}
          textValue={action.title}
        >
          <ActionImage action={action} />
          <ActionTitle action={action} />
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          {action.subactions.map((subaction) => (
            <ContextAction key={actionId(subaction)} action={subaction} />
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>
    )
  }

  return (
    <ContextMenuItem
      disabled={action.attributes?.disabled}
      onPress={action.onPress}
      textValue={action.title}
      variant={action.attributes?.destructive ? "destructive" : "default"}
    >
      <ActionImage action={action} />
      <ActionTitle action={action} />
      {action.state === "on" && <Text className="ml-auto">{"\u2713"}</Text>}
    </ContextMenuItem>
  )
}

export function Menu({
  actions,
  children,
  menuRef,
  onCloseMenu,
  onOpenMenu,
  shouldOpenOnLongPress,
  style,
  testID,
}: MenuProps) {
  const triggerRef = useRef<TriggerRef>(null)
  const insets = useSafeAreaInsets()
  const contentInsets = {
    top: insets.top,
    bottom: insets.bottom,
    left: 12,
    right: 12,
  }

  useImperativeHandle(menuRef, () => ({
    show: () => triggerRef.current?.open(),
  }))

  const onOpenChange = (open: boolean) => {
    if (open) {
      onOpenMenu?.()
    } else {
      onCloseMenu?.()
    }
  }

  if (shouldOpenOnLongPress) {
    return (
      <ContextMenu onOpenChange={onOpenChange} style={style} testID={testID}>
        <ContextMenuTrigger ref={triggerRef} asChild>
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent insets={contentInsets}>
          {actions.map((action) => (
            <ContextAction key={actionId(action)} action={action} />
          ))}
        </ContextMenuContent>
      </ContextMenu>
    )
  }

  return (
    <DropdownMenu onOpenChange={onOpenChange} style={style} testID={testID}>
      <DropdownMenuTrigger ref={triggerRef} asChild>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent insets={contentInsets}>
        {actions.map((action) => (
          <DropdownAction key={actionId(action)} action={action} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
