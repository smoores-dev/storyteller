import { randomBytes } from "node:crypto"

import { db } from "./database/connection"
import { getSettings } from "./database/settings"
import { getUserByUsernameOrEmail } from "./database/users"
import { env } from "./env"
import { logger } from "./logging"
import { sendMail } from "./mail"

// Reset tokens share the verification_token table; namespacing the identifier
// keeps them from colliding with other verification tokens.
const IDENTIFIER_PREFIX = "password-reset:"

export async function createPasswordResetToken(email: string) {
  const token = randomBytes(32).toString("hex")
  const expires = new Date(
    Date.now() + env.STORYTELLER_PASSWORD_RESET_EXPIRATION_MINUTES * 60 * 1000,
  )

  await db
    .insertInto("verificationToken")
    .values({ identifier: IDENTIFIER_PREFIX + email, token, expires })
    .execute()

  return token
}

// Single-use: the token is always deleted when found, even if expired. Returns
// the user's email only when the token was valid and unexpired.
export async function consumePasswordResetToken(token: string) {
  const row = await db
    .selectFrom("verificationToken")
    .selectAll()
    .where("token", "=", token)
    .where("identifier", "like", `${IDENTIFIER_PREFIX}%`)
    .executeTakeFirst()

  if (!row) return null

  await db
    .deleteFrom("verificationToken")
    .where("token", "=", token)
    .where("identifier", "=", row.identifier)
    .execute()

  // expires is declared Date but stored as text in SQLite, so normalize.
  if (new Date(row.expires) < new Date()) return null

  return { email: row.identifier.slice(IDENTIFIER_PREFIX.length) }
}

export async function sendPasswordReset(email: string, token: string) {
  const { libraryName, webUrl } = await getSettings()

  await sendMail({
    to: email,
    subject: `Reset your password for the "${libraryName}" Storyteller library`,
    text: `
Hello!

A password reset was requested for your account on the "${libraryName}" Storyteller library.

You can set a new password by following this link:

${webUrl}/reset-password/${token}

This link will expire in ${env.STORYTELLER_PASSWORD_RESET_EXPIRATION_MINUTES} minutes. If you didn't expect this, you can safely ignore this email.
`,
  })
}

// Self-service entry point: resolve the identifier to an account and email it a
// reset link. Always returns void so callers can't distinguish a hit from a miss.
// Skips sending if an unexpired reset token already exists for the account.
export async function requestPasswordReset(usernameOrEmail: string) {
  const user = await getUserByUsernameOrEmail(usernameOrEmail)
  if (!user?.email) return

  const existing = await db
    .selectFrom("verificationToken")
    .select(["token"])
    .where("identifier", "=", IDENTIFIER_PREFIX + user.email)
    .where("expires", ">", new Date())
    .executeTakeFirst()
  if (existing) return

  try {
    const token = await createPasswordResetToken(user.email)
    await sendPasswordReset(user.email, token)
  } catch (e) {
    logger.error("Failed to send password reset email")
    logger.error(e)
  }
}
