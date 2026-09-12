/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  type MessageKeys,
  type Messages,
  type NamespaceKeys,
  type NestedKeyOf,
  type NestedValueOf,
  type createTranslator,
  // oxlint-disable-next-line storyteller/no-next-intl-use-translations
  useTranslations,
} from "next-intl"

type IntlMessages = Record<string, any>
// taken from next-intl
type NamespacedMessageKeys<
  TranslatorMessages extends IntlMessages,
  Namespace extends NamespaceKeys<
    TranslatorMessages,
    NestedKeyOf<TranslatorMessages>
  > = never,
> = MessageKeys<
  NestedValueOf<
    {
      "!": TranslatorMessages
    },
    [Namespace] extends [never] ? "!" : `!.${Namespace}`
  >,
  NestedKeyOf<
    NestedValueOf<
      {
        "!": TranslatorMessages
      },
      [Namespace] extends [never] ? "!" : `!.${Namespace}`
    >
  >
>

export function MissingMessageFallback({
  result,
  k,
  namespace,
}: {
  result: string
  k: string
  namespace?: string
}) {
  return (
    <span
      className="underline decoration-dashed"
      title={`Missing message: ${namespace ? `${namespace}.` : ""}${k}`}
    >
      {result}
    </span>
  )
}

export function useTranslation<
  NestedKey extends NamespaceKeys<Messages, NestedKeyOf<Messages>> = never,
>(
  namespace?: NestedKey,
): ReturnType<typeof createTranslator<Messages, NestedKey>> & {
  plain: (
    key: NamespacedMessageKeys<Messages, NestedKey>,
    values?: Record<string, string | number>,
  ) => string
} {
  type T = ReturnType<typeof createTranslator<Messages, NestedKey>> & {
    plain: (
      key: NamespacedMessageKeys<Messages, NestedKey>,
      values?: Record<string, string | number>,
    ) => string
  }
  // oxlint-disable-next-line storyteller/no-next-intl-use-translations
  const t = useTranslations(namespace)

  const fn = (<TargetKey extends NamespacedMessageKeys<Messages, NestedKey>>(
    ...args: Parameters<typeof t<TargetKey>>
  ) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const result = (t as any).rich(...args, {
      em: (text: string) => <em>{text}</em>,
    })

    if (typeof result === "string" && result.includes("__fallback__")) {
      const [_key, ...rest] = result.split("__fallback__")
      const k = args[0] as string
      return (
        <MissingMessageFallback
          namespace={namespace}
          k={k}
          result={rest.join("__fallback__")}
        />
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return result
  }) as unknown as T

  return Object.assign(fn, {
    rich: t.rich.bind(fn),
    markup: t.markup.bind(fn),
    raw: t.raw.bind(fn),
    has: t.has.bind(fn),
    plain: (
      key: NamespacedMessageKeys<Messages, NestedKey>,
      values?: Record<string, string | number>,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
    ) => (t as any)(key, values),
  })
}

export function useCommon() {
  return useTranslation("Common")
}
