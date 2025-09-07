"use client"

import {
  Anchor,
  AppShell as MantineAppShell,
  AppShellHeader,
  AppShellMain,
  AppShellNavbar,
  Box,
  Burger,
  Fieldset,
  Group,
  Image,
  type MantineColorsTuple,
  MantineProvider,
  NativeSelect,
  NavLink,
  PasswordInput,
  Text,
  TextInput,
  Title,
  createTheme,
} from "@mantine/core"
import { useDisclosure } from "@mantine/hooks"
import {
  IconBook2,
  IconBooks,
  IconHome,
  IconLogout,
  IconPlus,
  IconSettings,
  IconUser,
  IconUsers,
} from "@tabler/icons-react"
import dayjs from "dayjs"
import customParseFormat from "dayjs/plugin/customParseFormat"
import NextImage from "next/image"
import NextLink from "next/link"
import { usePathname } from "next/navigation"
import { type ReactNode, useEffect } from "react"

import { type User } from "@/apiModels"
import { type CollectionWithRelations } from "@/database/collections"
import { IntersectionObserverProvider } from "@/hooks/useIntersectionObserver"
import { usePermissions } from "@/hooks/usePermissions"
import {
  api,
  useGetCurrentUserQuery,
  useListCollectionsQuery,
} from "@/store/api"
import { useAppDispatch } from "@/store/appState"

import { CreateCollectionModal } from "./collections/CreateCollectionModal"
import { CurrentBookProgress } from "./layout/CurrentBookProgress"

dayjs.extend(customParseFormat)

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
    AppShellNavbar: AppShellNavbar.extend({
      defaultProps: {
        className:
          "group/navbar border-r-st-orange-100 overflow-x-hidden border-r-2 md:w-10 md:transition-[width] md:hover:w-[200px]",
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
    PasswordInput: PasswordInput.extend({
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
  currentUser: User | undefined
  collections: CollectionWithRelations[]
}

export function AppShell({
  children,
  version,
  currentUser: initialCurrentUser,
  collections: initialCollections,
}: Props) {
  const dispatch = useAppDispatch()

  // TODO: Probably we should just make the init page a
  // client component like the login page so that we can
  // invalidate the tags there, instead of this weird workaround
  useEffect(() => {
    if (initialCurrentUser) {
      dispatch(api.util.invalidateTags(["CurrentUser"]))
    }
  }, [dispatch, initialCurrentUser])

  const [opened, { close, toggle }] = useDisclosure(false)
  const [
    isCreateCollectionOpen,
    { close: closeCreateCollection, open: openCreateCollection },
  ] = useDisclosure(false)
  const pathname = usePathname()

  const { data: liveCurrentUser } = useGetCurrentUserQuery()
  const currentUser = liveCurrentUser ?? initialCurrentUser
  const livePermissions = usePermissions()
  const permissions = livePermissions ?? currentUser?.permissions
  const { data: liveCollections } = useListCollectionsQuery()
  const collections = liveCollections ?? initialCollections

  return (
    <IntersectionObserverProvider
      options={{ rootMargin: "200px 0px 200px 0px" }}
    >
      <MantineProvider theme={theme} defaultColorScheme="light">
        <MantineAppShell
          className="h-full"
          withBorder={false}
          padding="md"
          navbar={{
            width: 40,
            breakpoint: "sm",
            collapsed: { mobile: !opened },
          }}
        >
          {currentUser && (
            <AppShellNavbar>
              <Group align="center" className="mt-16 md:mt-3">
                <Anchor component={NextLink} href="/">
                  <Group className="flex-nowrap" gap={2}>
                    <Image
                      component={NextImage}
                      h={40}
                      w={40}
                      height={40}
                      width={40}
                      src="/Storyteller_Logo.png"
                      alt=""
                      aria-hidden
                    />
                    <Title size="h3" className="text-black">
                      Storyteller
                    </Title>
                  </Group>
                </Anchor>
              </Group>

              <Box className="md:w-[200px]">
                <Text
                  c="black"
                  my="sm"
                  px="sm"
                  className="md:invisible md:group-hover/navbar:visible"
                >
                  Version: {version}
                </Text>
                <CurrentBookProgress />
                {permissions?.bookCreate || permissions?.bookList ? (
                  <>
                    <NavLink
                      onClick={close}
                      component={NextLink}
                      href="/"
                      leftSection={<IconHome />}
                      label="Home"
                      active={pathname === "/"}
                    />
                    <NavLink
                      onClick={close}
                      component={NextLink}
                      href="/books"
                      leftSection={<IconBook2 />}
                      label="Books"
                      active={pathname === "/books"}
                    />
                    <NavLink
                      onClick={close}
                      component={NextLink}
                      href={`/collections/none`}
                      leftSection={
                        <Box className="h-6 w-6 text-center italic">U</Box>
                      }
                      label={<span className="italic">Uncollected</span>}
                      active={pathname === `/collections/none`}
                    />
                    {collections.map((collection) => (
                      <NavLink
                        key={collection.uuid}
                        onClick={close}
                        component={NextLink}
                        leftSection={
                          <Box className="h-6 w-6 text-center">
                            {collection.name[0]}
                          </Box>
                        }
                        href={`/collections/${collection.uuid}`}
                        label={collection.name}
                        active={pathname === `/collections/${collection.uuid}`}
                      />
                    ))}
                    <NavLink
                      component="button"
                      onClick={openCreateCollection}
                      leftSection={<IconPlus />}
                      label="New collection"
                    />
                    <NavLink
                      onClick={close}
                      component={NextLink}
                      href="/series"
                      leftSection={<IconBooks />}
                      label="Series"
                      active={pathname === "/series"}
                    />
                  </>
                ) : null}
                <NavLink
                  onClick={close}
                  component={NextLink}
                  href="/account"
                  leftSection={<IconUser />}
                  label="Account"
                  active={pathname === "/accounts"}
                />
                {permissions?.userCreate || permissions?.userList ? (
                  <NavLink
                    onClick={close}
                    component={NextLink}
                    href="/users"
                    leftSection={<IconUsers />}
                    label="Users"
                    active={pathname === "/users"}
                  />
                ) : null}
                {permissions?.settingsUpdate ? (
                  <NavLink
                    onClick={close}
                    component={NextLink}
                    href="/settings"
                    leftSection={<IconSettings />}
                    label="Settings"
                    active={pathname === "/settings"}
                  />
                ) : null}
                <NavLink
                  onClick={close}
                  component="a"
                  href="/logout"
                  leftSection={<IconLogout />}
                  label="Logout"
                  active={pathname === "/logout"}
                />
              </Box>
            </AppShellNavbar>
          )}
          <AppShellMain className="h-full *:ml-8">
            {currentUser && (
              <Burger
                opened={opened}
                color="st-orange"
                onClick={toggle}
                size="md"
                className="visible absolute -left-7 top-4 z-[200] ml-4 md:invisible"
              />
            )}

            <CreateCollectionModal
              isOpen={isCreateCollectionOpen}
              onClose={closeCreateCollection}
            />
            {children}
          </AppShellMain>
        </MantineAppShell>
      </MantineProvider>
    </IntersectionObserverProvider>
  )
}
