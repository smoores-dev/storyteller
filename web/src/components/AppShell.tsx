"use client"

import NextImage from "next/image"

import NextLink from "next/link"
import {
  MantineProvider,
  AppShell as MantineAppShell,
  AppShellHeader,
  AppShellNavbar,
  AppShellMain,
  createTheme,
  MantineColorsTuple,
  Burger,
  NavLink,
  Title,
  Anchor,
  Group,
  Fieldset,
  TextInput,
  NativeSelect,
  Text,
  Image,
} from "@mantine/core"
import {
  IconBook2,
  IconUser,
  IconSettings,
  IconLogout,
} from "@tabler/icons-react"
import { ReactNode } from "react"
import { useDisclosure } from "@mantine/hooks"
import { usePathname } from "next/navigation"
import { usePermissions } from "@/contexts/UserPermissions"
import { LiveBooksProvider } from "./books/LiveBooksProvider"
import { CurrentBookProgress } from "./layout/CurrentBookProgress"
import { BookDetail } from "@/apiModels"

const stOrange: MantineColorsTuple = [
  "#fff1e7",
  "#fbe2d3",
  "#f6c2a5",
  "#f1a173",
  "#ed8449",
  "#eb722f",
  "#ea6920",
  "#d15815",
  "#ba4d0f",
  "#a34106",
]

const theme = createTheme({
  primaryColor: "st-orange",
  fontFamily: "var(--font-inter)",
  headings: {
    fontFamily: "var(--font-young-serif)",
  },
  colors: {
    "st-orange": stOrange,
  },
  components: {
    NavLink: NavLink.extend({
      classNames: {
        label: "text-base",
        root: "p-2 rounded-md",
      },
    }),
    AppShellMain: AppShellMain.extend({
      defaultProps: {
        className: "max-w-[1200px]",
      },
    }),
    AppShellHeader: AppShellHeader.extend({
      defaultProps: {
        className: "text-st-orange-50 py-4",
      },
    }),
    Burger: Burger.extend({
      defaultProps: {
        className: "pb-[0.625rem]",
      },
    }),
    Fieldset: Fieldset.extend({
      defaultProps: {
        className: "my-8",
        variant: "filled",
        classNames: {
          legend: "text-xl",
        },
      },
    }),
    TextInput: TextInput.extend({
      defaultProps: {
        className: "my-4",
      },
      classNames: {
        description: "text-sm",
      },
    }),
    NativeSelect: NativeSelect.extend({
      classNames: {
        description: "text-sm",
      },
    }),
  },
})

interface Props {
  version: string
  children: ReactNode
  books: BookDetail[]
}

export function AppShell({ children, version, books }: Props) {
  const [opened, { toggle }] = useDisclosure(false)
  const pathname = usePathname()
  const permissions = usePermissions()

  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <LiveBooksProvider initialBooks={books}>
        <MantineAppShell
          withBorder={false}
          header={{ height: 100 }}
          padding="md"
          navbar={{
            width: 300,
            breakpoint: "sm",
            collapsed: { mobile: !opened },
          }}
        >
          <AppShellHeader>
            <Group align="center">
              <Burger
                opened={opened}
                color="st-orange"
                onClick={toggle}
                hiddenFrom="sm"
                size="lg"
              />
              <Anchor component={NextLink} href="/">
                <Group>
                  <Image
                    component={NextImage}
                    h={80}
                    w={80}
                    height={80}
                    width={80}
                    src="/Storyteller_Logo.png"
                    alt=""
                    aria-hidden
                  />
                  <Title size="h1" className="text-black">
                    Storyteller
                  </Title>
                </Group>
              </Anchor>
            </Group>
          </AppShellHeader>
          <AppShellNavbar>
            <Text c="black" my="sm" px="sm">
              Version: {version}
            </Text>
            <CurrentBookProgress />
            {(permissions.book_create || permissions.book_list) && (
              <NavLink
                component={NextLink}
                href="/"
                leftSection={<IconBook2 />}
                label="Books"
                active={pathname === "/"}
              />
            )}
            {(permissions.user_create || permissions.user_list) && (
              <NavLink
                component={NextLink}
                href="/users"
                leftSection={<IconUser />}
                label="Users"
                active={pathname === "/users"}
              />
            )}
            {permissions.settings_update && (
              <NavLink
                component={NextLink}
                href="/settings"
                leftSection={<IconSettings />}
                label="Settings"
                active={pathname === "/settings"}
              />
            )}
            <NavLink
              component="a"
              href="/logout"
              leftSection={<IconLogout />}
              label="Logout"
              active={pathname === "/logout"}
            />
          </AppShellNavbar>
          <AppShellMain>{children}</AppShellMain>
        </MantineAppShell>
      </LiveBooksProvider>
    </MantineProvider>
  )
}
