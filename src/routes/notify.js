import Boom from '@hapi/boom'
import { createLogger } from '../common/helpers/logging/logger.js'
import { sendEmail } from '../common/helpers/notify.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../common/enums/event.js'

/**
 * Route to send email notifications using GOV.UK Notify
 * This is not required for the main functionality but is used to demonstrate how to set up a route for sending emails
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
      const message = 'Failed to send email'
      const logger = createLogger()
      logger.error({
        message,
        event: {
          category: LOGGING_EVENT_CATEGORIES.HTTP,
          action: LOGGING_EVENT_ACTIONS.SEND_EMAIL_FAILURE
        },
        error: {
          message: err.message,
          stack_trace: err.stack,
          type: err.name
        }
      })
      throw Boom.badImplementation('Failed to send email')
    }
  }
}

export { notify }
