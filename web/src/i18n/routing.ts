import { defineRouting } from "next-intl/routing"

import { LOCALE_COOKIE_NAME } from "./constants"
import { locales } from "./locales"

export const routing = defineRouting({
  defaultLocale: "en",
  locales: Object.keys(locales) as [keyof typeof locales],
  localeDetection: true,
  localeCookie: {
    name: LOCALE_COOKIE_NAME,
  },
  localePrefix: "never",
})
