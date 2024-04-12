import { createTransport } from "nodemailer"
import { getSettings } from "./database/settings"

export async function sendInvite(email: string, key: string) {
  const settings = await getSettings()
  const {
    libraryName,
    webUrl,
    smtpFrom,
    smtpHost,
    smtpPassword,
    smtpPort,
    smtpUsername,
  } = settings

  const transporter = createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: false,
    auth: {
      user: smtpUsername,
      pass: smtpPassword,
    },
  })

  await transporter.sendMail({
    from: smtpFrom,
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
