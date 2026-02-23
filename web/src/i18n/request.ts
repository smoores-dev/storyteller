import { cookies } from "next/headers"
import { getRequestConfig } from "next-intl/server"

import { LOCALE_COOKIE_NAME } from "./constants"
import type { locales } from "./locales"

export default getRequestConfig(async () => {
  const store = await cookies()
  const locale =
    (store.get(LOCALE_COOKIE_NAME)?.value as
      | keyof typeof locales
      | undefined) || "en"

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const messages = (await import(`../../messages/${locale}.json`)).default

  return {
    locale,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    messages,
  }
})
