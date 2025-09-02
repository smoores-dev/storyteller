import { type NextRequest } from "next/server"

import { nextAuth } from "@/auth/auth" // Referring to the auth.ts we just created

export function GET(request: NextRequest) {
  return nextAuth.handlers.GET(request)
}

export function POST(request: NextRequest) {
  return nextAuth.handlers.POST(request)
}
