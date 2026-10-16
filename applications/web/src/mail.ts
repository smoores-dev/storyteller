import { type SendMailOptions, createTransport } from "nodemailer"

import { getSettings } from "./database/settings"
import { logger } from "./logging"

export async function sendMail(message: Omit<SendMailOptions, "from">) {
  const {
    smtpFrom,
    smtpHost,
    smtpPassword,
    smtpPort,
    smtpUsername,
    smtpSsl,
    smtpRejectUnauthorized,
  } = await getSettings()

  if (!smtpHost) {
    logger.info("No SMTP client configured. Printing message to log:")
    logger.info(message.text)
    return
  }

  const transporter = createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSsl ?? true,
    tls: {
      rejectUnauthorized: smtpRejectUnauthorized ?? true,
    },
    auth: smtpUsername
      ? {
          user: smtpUsername,
          pass: smtpPassword,
        }
      : undefined,
  })

  await transporter.sendMail({ from: smtpFrom, ...message })
}
