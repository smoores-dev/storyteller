import { nextAuth } from "@/auth/auth" // Referring to the auth.ts we just created
import { NextRequest } from "next/server"

export function GET(request: NextRequest) {
  return nextAuth.handlers.GET(request)
}

export function POST(request: NextRequest) {
  return nextAuth.handlers.POST(request)
}
