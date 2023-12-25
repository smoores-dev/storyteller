import { ApiClient, ApiClientError } from "@/apiClient"
import { NextRequest, NextResponse } from "next/server"
import { rootPath } from "./app/apiHost"

// This function can be marked `async` if using `await` inside
export async function middleware(request: NextRequest) {
  const isInitPage = request.nextUrl.pathname.startsWith("/init")

  const origin = request.nextUrl.origin
  const client = new ApiClient(origin, rootPath)

  // Set a custom header so that server components
  // can more easily read the request origin
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-storyteller-origin", origin)

  const next = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

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
      return next
    }

    console.error(e)
  }

  return next
}

export const config = {
  matcher: ["/", "/login", "/invites/:path", "/settings", "/users", "/init"],
}
