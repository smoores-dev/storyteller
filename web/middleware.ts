import { ApiClient, ApiClientError } from "@/apiClient"
import { NextRequest, NextResponse } from "next/server"
import { apiHost } from "./app/apiHost"

export async function middleware(request: NextRequest) {
  // Proxy all requests to `/api` to the actual API server
  if (request.nextUrl.pathname.startsWith("/api")) {
    const destinationPathname = request.nextUrl.pathname.replace("/api", "")
    return NextResponse.rewrite(new URL(destinationPathname, apiHost))
  }

  const isInitPage = request.nextUrl.pathname.startsWith("/init")

  const client = new ApiClient(
    apiHost,
    process.env["STORYTELLER_ROOT_PATH"] ?? ""
  )

  try {
    const needsInit = await client.needsInit()
    if (needsInit && !isInitPage) {
      return NextResponse.redirect(new URL("/init", request.url))
    }
  } catch (e) {
    if (e instanceof ApiClientError && e.statusCode === 403) {
      if (isInitPage) {
        return NextResponse.redirect(new URL("/", request.url))
      }
      return NextResponse.next()
    }

    console.error(e)
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
