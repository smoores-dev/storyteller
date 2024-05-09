import { requireNativeViewManager } from "expo-modules-core"
import * as React from "react"

import { EPUBViewProps, EPUBViewRef } from "./Readium.types"

const NativeView: React.ComponentType<
  React.PropsWithoutRef<EPUBViewProps> & React.RefAttributes<EPUBViewRef>
> = requireNativeViewManager("Readium")

function EPUBView(props: EPUBViewProps, ref: React.Ref<EPUBViewRef>) {
  return <NativeView ref={ref} {...props} />
}

const ForwardedEPUBView = React.forwardRef(EPUBView)

export default ForwardedEPUBView
