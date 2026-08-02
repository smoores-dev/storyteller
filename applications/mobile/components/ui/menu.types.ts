import { type MenuAction as ExpoMenuAction } from "@expo/ui/community/menu"
import { type ReactElement, type Ref } from "react"
import { type StyleProp, type ViewStyle } from "react-native"

export type MenuAction = Omit<ExpoMenuAction, "subactions"> & {
  onPress?: () => void
  subactions?: MenuAction[]
}

export type MenuRef = {
  show: () => void
}

export type MenuProps = {
  actions: MenuAction[]
  children: ReactElement
  menuRef?: Ref<MenuRef>
  onCloseMenu?: () => void
  onOpenMenu?: () => void
  shouldOpenOnLongPress?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
  title?: string
}
