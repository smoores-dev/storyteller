import { deepmergeCustom } from "deepmerge-ts"
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

  // we load english as a fallback
  // annoying this isn't built in
  const english = (await import(`../../messages/en.json`)).default
  if (locale === "en") {
    return {
      locale,
      messages: english,
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const messages = (await import(`../../messages/${locale}.json`)).default

  const prefix = "__fallback__"
  const prefixedEnglish = JSON.parse(
    JSON.stringify(english).replace(/":"/g, `":"${prefix}`),
  ) as typeof english
  // merge messages into english, so we will always have english as the fallback
  // but prefix all english messages with "__fallback__" so we can later, in
  // `use-translation`, pick those out and render a special component urging
  // the user to contribute to the translation.
  const merged = deepmergeCustom({
    enableImplicitDefaultMerging: true,
    // for some reason stuff like `"Select {book}"` becomes `["Select", ["book"]]`
    // this is kinda hard to prefix, _and_ we shouldnt merge them. The locale version should just override it
    mergeArrays: false,
  })(prefixedEnglish, messages)

  return {
    locale,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    messages: merged,
  }
})
