import { NotifyClient } from 'notifications-node-client'
import { createLogger } from './logging/logger.js'
import { getLocalSecret } from './get-local-secret.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../enums/event.js'

async function sendEmail(templateId, emailAddress, personalisation = {}) {
  const logger = createLogger()
  const apiKey =
    process.env.NODE_ENV === 'development'
      ? getLocalSecret('GOVUK_NOTIFY_API_KEY')
      : process.env.GOVUK_NOTIFY_API_KEY

  let notifyClient = {}

  if (!apiKey) {
    logger.warn({
      message:
        'Missing GOVUK_NOTIFY_API_KEY in environment, notifyClient will not be available',
      event: {
        category: LOGGING_EVENT_CATEGORIES.CONFIG,
        action: LOGGING_EVENT_ACTIONS.NOT_FOUND
      }
    })
  } else {
    notifyClient = new NotifyClient(apiKey)
  }

  try {
    await notifyClient.sendEmail?.(templateId, emailAddress, {
      personalisation
    })
  } catch (err) {
    logger.error(err, {
      message: 'Could not send email',
      event: {
        category: LOGGING_EVENT_CATEGORIES.HTTP,
        action: LOGGING_EVENT_ACTIONS.SEND_EMAIL_FAILURE
      }
    })
    throw err
  }
}

export { sendEmail }
