import { ApiClient, ApiClientError } from "@/apiClient"
import { NextRequest, NextResponse } from "next/server"
import { apiHost } from "./app/apiHost"

export async function middleware(request: NextRequest) {
  // Proxy all requests to `/api` to the actual API server
  if (request.nextUrl.pathname.startsWith("/api")) {
    const destinationPathname = request.nextUrl.pathname.replace("/api", "")
    const response = await fetch(new URL(destinationPathname, apiHost), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      credentials: request.credentials,
      cache: request.cache,
      integrity: request.integrity,
      mode: request.mode,
      redirect: request.redirect,
      referrer: request.referrer,
      referrerPolicy: request.referrerPolicy,
      keepalive: request.keepalive,
    })
    // HACK - Next.js neither preserves nor sets content-length for responses returned
    // from middleware. We have MODIFIED our copy of Next.js in this repo to inspect
    // body.length to determine content-length, because it is required for downloads.
    //
    // Note: Do not update Next.js version without reinstating this hack.
    // Set resHeaders['content-length'] = middlewareRes.body?.length in
    // next/dist/server/lib/router-utils/resolve-routes.js
    const contentLength = response.headers.get("content-length")
    if (response.body && contentLength) {
      ;(response.body as any).length = contentLength
    }
    // ENDHACK
    return response
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
