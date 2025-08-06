import Boom from '@hapi/boom'
import { sendEmail } from '../common/helpers/notify.js'

/**
 * Route to send email notifications using GOV.UK Notify
 * This is not required for the main functionality but is used to demonstrate how to set up a route for sending emails.
 * @module routes/notify
 */
const notify = {
  method: 'POST',
  path: '/send-email',
  options: {
    validate: {
      payload: (value, _options) => {
        if (
          !value.email ||
          !value.template ||
          typeof value.personalisation !== 'object'
        ) {
          throw Boom.badRequest('Invalid payload')
        }
        return value
      }
    }
  },
  handler: async (request, h) => {
    const { email, template, personalisation } = request.payload

    try {
      await sendEmail(template, email, personalisation)
      return h.response({ success: true })
    } catch (err) {
      console.error('Notify error:', err)
      throw Boom.badImplementation('Failed to send email')
    }
  }
}

export { notify }
