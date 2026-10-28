import { Platform } from "react-native"

/**
 * Whether the navigation header is drawn by the system on this platform.
 *
 * iOS lets the system draw the header so it is free to host its controls — the
 * back action included — in the iPhone Duo vertical rail. Android keeps the
 * app's own JavaScript chrome, which the system does not reposition.
 *
 * Screens that run under the system header must not pad their content by the
 * top safe area: the system draws the bar, and on iPhone Duo it may draw it in
 * the rail instead of at the top. Those screens let scroll views take the bar
 * through `contentInsetAdjustmentBehavior="automatic"`.
 */
export const usesSystemHeader = Platform.OS === "ios"
