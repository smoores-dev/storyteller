import { ApiClient } from "@/apiClient"
import { NextRequest, NextResponse } from "next/server"
import { apiHost, proxyRootPath } from "./app/apiHost"
import { cookies } from "next/headers"

export async function middleware(request: NextRequest) {
  const isInitPage = request.nextUrl.pathname.startsWith("/init")

  const client = new ApiClient(apiHost, proxyRootPath)

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

  const cookieStore = await cookies()
  const authTokenCookie = cookieStore.get("st_token")
  const isLoginPage = request.nextUrl.pathname.startsWith("/login")
  if (!authTokenCookie && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/", "/login", "/invites/:path", "/settings", "/users", "/init"],
}
