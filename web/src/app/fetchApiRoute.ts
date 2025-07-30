import { cookies } from "next/headers"
import { apiHost } from "./apiHost"
import { notFound, redirect } from "next/navigation"

export async function fetchApiRoute<Result>(endpoint: string) {
  const cookieStore = await cookies()
  const authTokenCookie = cookieStore.get("st_token")

  const response = await fetch(new URL(`/api/v2${endpoint}`, apiHost), {
    ...(authTokenCookie && {
      headers: { Authorization: `Bearer ${authTokenCookie.value}` },
    }),
  })

  if (!response.ok) {
    if (response.status === 404) {
      notFound()
    }

    if (response.status === 401) {
      redirect("/login")
    }

    if (response.status === 403) {
      notFound()
    }

    throw new Error(`Server error — check logs for details`)
  }

  const result = (await response.json()) as Result
  return result
}
