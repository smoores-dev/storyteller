import { ApiClient, ApiClientError } from "@/apiClient"
import { NextRequest, NextResponse } from "next/server"
import { apiHost } from "./app/apiHost"

// This function can be marked `async` if using `await` inside
export async function middleware(request: NextRequest) {
  const isInitPage = request.nextUrl.pathname.startsWith("/init")

  const client = new ApiClient(apiHost)
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
      return
    }

    console.error(e)
  }

  return
}

export const config = {
  matcher: ["/", "/login", "/invites/:path", "/settings", "/users", "/init"],
}
