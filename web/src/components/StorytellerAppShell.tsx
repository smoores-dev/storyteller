"use client"

import {
  Anchor,
  AppShell,
  Box,
  Burger,
  Group,
  Image,
  NavLink,
  Text,
  Title,
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

interface Props {
  demoMode?: boolean
  version: string
  children: ReactNode
  currentUser: User | undefined
  collections: CollectionWithRelations[]
}

export function StorytellerAppShell({
  demoMode,
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
      <AppShell
        className="h-full"
        withBorder={false}
        padding="md"
        navbar={{
          width: 40,
          breakpoint: "sm",
          collapsed: { mobile: !opened },
        }}
      >
        <AppShell.Navbar>
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
              px="sm"
              className="mb-2 font-mono text-xs text-gray-500 md:invisible md:group-hover/navbar:visible"
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
                {/* eslint-disable-next-line @typescript-eslint/no-unnecessary-type-conversion */}
                {!!permissions.collectionCreate && (
                  <NavLink
                    component="button"
                    onClick={openCreateCollection}
                    leftSection={<IconPlus />}
                    label="New collection"
                  />
                )}
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
            {!demoMode || permissions?.userCreate ? (
              <NavLink
                onClick={close}
                component={NextLink}
                href="/account"
                leftSection={<IconUser />}
                label="Account"
                active={pathname === "/accounts"}
              />
            ) : null}
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
        </AppShell.Navbar>

        <AppShell.Main className="h-full *:ml-8">
          <Burger
            opened={opened}
            color="st-orange"
            onClick={toggle}
            size="md"
            className="visible absolute -left-7 top-4 z-[200] ml-4 md:invisible"
          />

          <CreateCollectionModal
            isOpen={isCreateCollectionOpen}
            onClose={closeCreateCollection}
          />
          {children}
        </AppShell.Main>
      </AppShell>
    </IntersectionObserverProvider>
  )
}
