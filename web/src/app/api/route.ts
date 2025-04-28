import { NextResponse } from "next/server"

/**
 * @name Hello, world
 * @desc Returns a static JSON object (`{Hello: "World"`). Can be used
 *       to confirm that the server is reachable.
 */
export function GET() {
  return NextResponse.json({ Hello: "World" })
}
