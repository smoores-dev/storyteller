import { createAuthedApiClient } from "@/authedApiClient"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export async function GET() {
  const client = await createAuthedApiClient()
  await client.logout()

  redirect("/login")
}
