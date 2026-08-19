import { type NextRequest, NextResponse } from "next/server"

import { hasV3Route } from "./v3Routes"

// the actual v2 -> v3 rewrites are config rewrites in next.config.ts (see
// src/v3Routes.ts for why they cannot live here). this proxy only stamps
// x-v3-rewritten on requests those rewrites will match, so server components
// can tell a rewritten /settings apart from a direct /v3/settings when
// building redirect targets.
// this is all fucking stupid and ill be glad to be done with it.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith("/v3")) return NextResponse.next()

  const versionCookie = request.cookies.get("frontend-version")?.value
  const wantsV2 = versionCookie === "v2"

  if (wantsV2 || !hasV3Route(pathname)) return NextResponse.next()

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-v3-rewritten", "1")

  return NextResponse.next({
    request: { headers: requestHeaders },
  })
}

export const config = {
  matcher: ["/((?!_next|api|fonts|.*\\..*).*)"],
}
