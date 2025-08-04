import { sendEmail } from '../common/helpers/notify.js'

const notify = {
  method: 'POST',
  path: '/send-email',
  options: {
    validate: {
      payload: (value, options) => {
        if (!value.email || !value.template || typeof value.personalisation !== 'object') {
          throw new Error('Invalid payload')
        }
        return value
      }
    }
  },
  handler: async (request, h) => {
    const { email, template, personalisation } = request.payload

    const templateId =
    template === 'registration'
    ? process.env.GOVUK_NOTIFY_TEMPLATE_ID_REGISTRATION
    : process.env.GOVUK_NOTIFY_TEMPLATE_ID_ACCREDITATION
    
    console.log('templateId: ', templateId);
    try {
      await sendEmail(templateId, email, personalisation)
      return h.response({ success: true }).code(200)
    } catch (err) {
      console.error(err)
      return h.response({ success: false, error: err.message }).code(500)
    }
  }
}

export { notify }
