import { nextAuth } from "@/auth/auth"

export const dynamic = "force-dynamic"

export async function GET() {
  await nextAuth.signOut({ redirectTo: "/login" })
}
