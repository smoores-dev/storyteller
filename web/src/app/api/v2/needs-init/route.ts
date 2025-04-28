import { getUserCount } from "@/database/users"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * @summary Determine whether the server needs to be initialized
 * @desc Will return a 204 if the server has not been initialized with
 *       an admin user. Once an admin user has been created, this
 *       endpoint will always return a 403.
 */
export async function GET() {
  const count = await getUserCount()
  if (count > 0) {
    return new NextResponse(null, { status: 403 })
  }
  return new Response(null, { status: 204 })
}
