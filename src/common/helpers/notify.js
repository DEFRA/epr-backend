import { NotifyClient } from 'notifications-node-client'
import { createLogger } from './logging/logger.js'

const apiKey = process.env.GOVUK_NOTIFY_API_KEY
// @fixme: add coverage
/* istanbul ignore next */
if (!apiKey) {
  throw new Error('Missing GOVUK_NOTIFY_API_KEY in environment')
}
const notifyClient = new NotifyClient(apiKey)

async function sendEmail(templateId, emailAddress, personalisation = {}) {
  try {
    await notifyClient.sendEmail(templateId, emailAddress, { personalisation })
  } catch (err) {
    const logger = createLogger()
    logger.error(err)
    throw err
  }
}

export { sendEmail }
