import { withVerifyToken } from "@/auth"
import { getUser, UserPermissionSet } from "@/database/users"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * @summary Get the current user details
 * @desc '
 */
export const GET = withVerifyToken(
  async (_request, _context, _token, tokenData) => {
    const user = await getUser(tokenData.username)

    if (!user) {
      return NextResponse.json(
        {
          message: "Invalid authentication credentials",
        },
        {
          status: 401,
          headers: { "WWW-Authenticate": "Bearer" },
        },
      )
    }

    return NextResponse.json({
      uuid: user.uuid,
      full_name: user.fullName,
      username: user.username,
      email: user.email,
      permissions: {
        bookCreate: user.permissions?.bookCreate ?? false,
        bookDelete: user.permissions?.bookDelete ?? false,
        bookDownload: user.permissions?.bookDownload ?? false,
        bookList: user.permissions?.bookList ?? false,
        bookProcess: user.permissions?.bookProcess ?? false,
        bookRead: user.permissions?.bookRead ?? false,
        bookUpdate: user.permissions?.bookUpdate ?? false,
        inviteDelete: user.permissions?.inviteDelete ?? false,
        inviteList: user.permissions?.inviteList ?? false,
        settingsUpdate: user.permissions?.settingsUpdate ?? false,
        userCreate: user.permissions?.userCreate ?? false,
        userDelete: user.permissions?.userDelete ?? false,
        userList: user.permissions?.userList ?? false,
        userRead: user.permissions?.userRead ?? false,
        userUpdate: user.permissions?.userUpdate ?? false,
      } satisfies UserPermissionSet,
    })
  },
)
