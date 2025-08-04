import { NotifyClient } from 'notifications-node-client'
import dotenv from 'dotenv'
dotenv.config()


const apiKey = process.env.GOVUK_NOTIFY_API_KEY
if (!apiKey) {
  throw new Error('Missing GOVUK_NOTIFY_API_KEY in environment')
}
const notifyClient = new NotifyClient(apiKey)

async function sendEmail(templateId, emailAddress, personalisation = {}) {
  try {
    await notifyClient.sendEmail(templateId, emailAddress, { personalisation })
  } catch (err) {
    console.error('Notify Error:', err)
    throw err
  }
}

export { sendEmail }