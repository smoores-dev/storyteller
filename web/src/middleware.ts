import { type NextRequest, NextResponse } from "next/server"

import { nextAuth } from "./auth/auth"
import { getUserCount } from "./database/users"

export async function middleware(request: NextRequest) {
  const isInitPage = request.nextUrl.pathname.startsWith("/init")

  const needsInit = (await getUserCount()) === 0

  if (needsInit && !isInitPage) {
    return NextResponse.redirect(new URL("/init", request.url))
  }

  if (!needsInit && isInitPage) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  if (needsInit && isInitPage) {
    return NextResponse.next()
  }

  const session = await nextAuth.auth()
  const isLoginPage = request.nextUrl.pathname.startsWith("/login")
  if (!session && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  if (session && isLoginPage) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  return NextResponse.next()
}

export const config = {
  runtime: "nodejs",
  matcher: [
    "/",
    "/books",
    "/books/:uuid",
    "/collections/:uuid",
    "/login",
    "/settings",
    "/users",
    "/account",
    "/init",
  ],
}
