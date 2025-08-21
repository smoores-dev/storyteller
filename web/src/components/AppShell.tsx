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
  PasswordInput,
  Box,
} from "@mantine/core"
import {
  IconUser,
  IconSettings,
  IconLogout,
  IconUsers,
  IconHome,
  IconBooks,
  IconBook2,
  IconPlus,
} from "@tabler/icons-react"
import { ReactNode, useEffect } from "react"
import { useDisclosure } from "@mantine/hooks"
import { usePathname } from "next/navigation"
import { CurrentBookProgress } from "./layout/CurrentBookProgress"
import dayjs from "dayjs"
import customParseFormat from "dayjs/plugin/customParseFormat"
import {
  api,
  useGetCurrentUserQuery,
  useListCollectionsQuery,
} from "@/store/api"
import { usePermissions } from "@/hooks/usePermissions"
import { User } from "@/apiModels"
import { useInitialData } from "@/hooks/useInitialData"
import { skipToken } from "@reduxjs/toolkit/query"
import { CollectionWithRelations } from "@/database/collections"
import { CreateCollectionModal } from "./collections/CreateCollectionModal"
import { IntersectionObserverProvider } from "@/hooks/useIntersectionObserver"
import { useAppDispatch } from "@/store/appState"

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

  useInitialData(
    initialCurrentUser
      ? api.util.upsertQueryData(
          "getCurrentUser",
          undefined,
          initialCurrentUser,
        )
      : skipToken,
  )

  useInitialData(
    api.util.upsertQueryData("listCollections", undefined, initialCollections),
  )

  const { data: currentUser } = useGetCurrentUserQuery()
  const permissions = usePermissions()
  const { data: collections } = useListCollectionsQuery()

  return (
    <IntersectionObserverProvider
      options={{ rootMargin: "200px 0px 200px 0px" }}
    >
      <MantineProvider theme={theme} defaultColorScheme="light">
        <MantineAppShell
          withBorder={false}
          header={{ height: 100 }}
          padding="md"
          navbar={{
            width: 40,
            breakpoint: "sm",
            collapsed: { mobile: !opened },
          }}
        >
          <AppShellHeader>
            <Group align="center">
              {currentUser && (
                <Burger
                  opened={opened}
                  color="st-orange"
                  onClick={toggle}
                  size="md"
                  className="visible ml-4 md:invisible"
                />
              )}
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
          {currentUser && (
            <AppShellNavbar className="group/navbar border-r-st-orange-100 overflow-x-hidden border-r-2 transition-[width] md:w-10 md:hover:w-[200px]">
              <Box className="md:w-[200px]">
                <Text
                  c="black"
                  my="sm"
                  px="sm"
                  className="invisible group-hover/navbar:visible"
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
                    {collections?.map((collection) => (
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
          <AppShellMain className="*:ml-8">
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
