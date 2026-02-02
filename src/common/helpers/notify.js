import obfuscateEmail from 'obfuscate-mail'

import { NotifyClient } from 'notifications-node-client'
import { audit } from '@defra/cdp-auditing'
import { logger } from './logging/logger.js'
import { getLocalSecret } from './get-local-secret.js'
import { config } from '#root/config.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES,
  AUDIT_EVENT_ACTIONS,
  AUDIT_EVENT_CATEGORIES
} from '../enums/event.js'

async function sendEmail(templateId, emailAddress, personalisation = {}) {
  const apiKey = config.get('isDevelopment')
    ? getLocalSecret('govukNotifyApiKeyPath')
    : config.get('govukNotifyApiKeyPath')

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
    audit({
      event: {
        category: AUDIT_EVENT_CATEGORIES.EMAIL,
        action: AUDIT_EVENT_ACTIONS.EMAIL_SENT
      },
      context: {
        templateId,
        emailAddress: obfuscateEmail(emailAddress, {
          asterisksLength: 8,
          showDomainName: false,
          minimumNameObfuscationLength: 3,
          visibleCharactersEndLength: 4,
          visibleCharactersStartLength: 4
        }),
        personalisation
      }
    })
  } catch (error) {
    logger.error({
      err: error,
      message: 'Could not send email',
      event: {
        category: LOGGING_EVENT_CATEGORIES.HTTP,
        action: LOGGING_EVENT_ACTIONS.SEND_EMAIL_FAILURE
      }
    })
    throw error
  }
}

export { sendEmail }
