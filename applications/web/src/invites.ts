import { getSettings } from "./database/settings"
import { sendMail } from "./mail"

export async function sendInvite(email: string, key: string) {
  const { libraryName, webUrl } = await getSettings()

  await sendMail({
    to: email,
    subject: `Invited to the "${libraryName}" Storyteller library`,
    text: `
Hello!

You've been invited to the "${libraryName}" Storyteller library.

You can accept your invite by following this link:

${webUrl}/invites/${key}
`,
  })
}
