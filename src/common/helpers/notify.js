import { NotifyClient } from 'notifications-node-client'
import { createLogger } from './logging/logger.js'
import { getLocalSecret } from './get-local-secret.js'

async function sendEmail(templateId, emailAddress, personalisation = {}) {
  const logger = createLogger()
  const apiKey =
    process.env.NODE_ENV === 'development'
      ? getLocalSecret('GOVUK_NOTIFY_API_KEY')
      : process.env.GOVUK_NOTIFY_API_KEY

  let notifyClient = {}

  if (!apiKey) {
    logger.warn(
      'Missing GOVUK_NOTIFY_API_KEY in environment, notifyClient will not be available'
    )
  } else {
    notifyClient = new NotifyClient(apiKey)
  }

  try {
    await notifyClient.sendEmail?.(templateId, emailAddress, {
      personalisation
    })
  } catch (err) {
    logger.error(err)
    throw err
  }
}

export { sendEmail }
