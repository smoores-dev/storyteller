import { ApiClient } from "@/apiClient"
import { NextRequest, NextResponse } from "next/server"
import { apiHost } from "./app/apiHost"
import { cookies } from "next/headers"

export async function middleware(request: NextRequest) {
  // Proxy all requests to `/api` to the actual API server
  if (request.nextUrl.pathname.startsWith("/api")) {
    const destinationPathname = request.nextUrl.pathname.replace("/api", "")
    const destinationSearch = request.nextUrl.search
    const destinationUrl = new URL(destinationPathname, apiHost)
    destinationUrl.search = destinationSearch
    return NextResponse.rewrite(destinationUrl)
  }

  const isInitPage = request.nextUrl.pathname.startsWith("/init")

  const client = new ApiClient(
    apiHost,
    process.env["STORYTELLER_ROOT_PATH"] ?? "",
  )

  const needsInit = await client.needsInit()
  if (needsInit && !isInitPage) {
    return NextResponse.redirect(new URL("/init", request.url))
  }

  if (!needsInit && isInitPage) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  if (needsInit && isInitPage) {
    return NextResponse.next()
  }

  const cookieStore = cookies()
  const authTokenCookie = cookieStore.get("st_token")
  if (!authTokenCookie) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/",
    "/api/:path*",
    "/login",
    "/invites/:path",
    "/settings",
    "/users",
    "/init",
  ],
}
