"use client"

import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"

import { cn } from "@/cn"
import { locales } from "@/i18n/locales"

import { changeLocaleAction } from "@v3/_/actions/changeLocaleAction"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@v3/_/components/ui/dropdown-menu"

export const LocaleChanger = ({ nested = false }: { nested?: boolean }) => {
  const t = useTranslations("AppSidebar")
  const currentLocale = useLocale()

  const Menu = nested ? DropdownMenuSub : DropdownMenu
  const Trigger = nested ? DropdownMenuSubTrigger : DropdownMenuTrigger
  const Content = nested ? DropdownMenuSubContent : DropdownMenuContent
  const router = useRouter()

  const currentLocaleObject = Object.values(locales).find(
    (locale) => locale.value === currentLocale,
  )

  return (
    <Menu>
      <Trigger>
        <span className="text-xs">{currentLocaleObject?.flag}</span>
        <span className="text-xs">{t(`localeChanger.${currentLocale}`)}</span>
      </Trigger>

      <Content>
        {Object.entries(locales).map(([key, locale]) => {
          const keyLocale = key as keyof typeof locales
          return (
            <DropdownMenuItem
              key={keyLocale}
              onClick={async () => {
                await changeLocaleAction(keyLocale)
                router.refresh()
              }}
              className={cn(
                "flex items-center gap-2",
                currentLocale === key && "bg-accent text-accent-foreground",
              )}
            >
              <span className="text-xs">{locale.flag}</span>
              {t(`localeChanger.${keyLocale}`)}
            </DropdownMenuItem>
          )
        })}
      </Content>
    </Menu>
  )
}
