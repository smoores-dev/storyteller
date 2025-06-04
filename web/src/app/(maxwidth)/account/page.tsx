import { config, hashPassword, nextAuth } from "@/auth/auth"
import { createAuthedApiClient } from "@/authedApiClient"
import { getAccounts, updateUser } from "@/database/users"
import { Button, PasswordInput, Stack, TextInput, Title } from "@mantine/core"
import { AuthError } from "next-auth"
import { revalidatePath } from "next/cache"

export default async function AccountPage() {
  const client = await createAuthedApiClient()
  const currentUser = await client.getCurrentUser()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { credentials: _, ...providersMap } = await client.listProviders()
  const providers = Object.values(providersMap)
  const linkedAccounts = await getAccounts(currentUser.id)

  const unlinkedProviders = providers.filter((p) =>
    linkedAccounts.every((a) => a.provider !== p.id),
  )

  async function updateUserAction(data: FormData) {
    "use server"

    const username = data.get("username")?.valueOf() as string
    const email = data.get("email")?.valueOf() as string
    const name = data.get("name")?.valueOf() as string
    const password = data.get("password")?.valueOf() as string | undefined
    const hashedPassword = password && (await hashPassword(password))

    await updateUser(currentUser.id, {
      username,
      email,
      name,
      ...(hashedPassword && { hashedPassword }),
    })

    revalidatePath("/account")
  }

  return (
    <>
      <header>
        <Title order={2}>Account</Title>
      </header>
      <form action={updateUserAction}>
        <Stack gap={0}>
          <TextInput
            label="Username"
            name="username"
            autoCapitalize="none"
            autoCorrect="off"
            defaultValue={currentUser.username ?? ""}
          />
          <TextInput
            label="Email"
            name="email"
            autoCapitalize="none"
            autoCorrect="off"
            defaultValue={currentUser.email}
          />
          <TextInput
            label="Name"
            name="name"
            autoCorrect="off"
            defaultValue={currentUser.name ?? ""}
          />
          <PasswordInput
            label={
              linkedAccounts.some(
                (account) => account.provider === "credentials",
              )
                ? "Change password"
                : "Add password"
            }
            name="password"
          />
          <Button className="my-4 self-end" type="submit">
            Save
          </Button>
        </Stack>
      </form>
      <Title order={3} className="my-4">
        Linked accounts
      </Title>
      {linkedAccounts
        .filter((account) => account.provider !== "credentials")
        .map((account) => (
          <form
            key={account.provider}
            action={async function unlink() {
              "use server"
              await config.adapter?.unlinkAccount?.(account)
              revalidatePath("/account")
            }}
          >
            <Button variant="outline" type="submit">
              <span>Unlink from {providersMap[account.provider]?.name}</span>
            </Button>
          </form>
        ))}
      {unlinkedProviders.map((provider) => (
        <form
          key={provider.id}
          action={async function oauthLogin() {
            "use server"
            try {
              await nextAuth.signIn(provider.id, { redirectTo: "/account" })
            } catch (error) {
              if (error instanceof AuthError) {
                console.error(error)
                return
              }

              throw error
            }
          }}
        >
          <Button variant="outline" type="submit">
            <span>Link with {provider.name}</span>
          </Button>
        </form>
      ))}
    </>
  )
}
