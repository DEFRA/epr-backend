import Boom from '@hapi/boom'
import Joi from 'joi'
import { describe, expect, it } from 'vitest'
import { loggerOptions } from './logger-options.js'

describe('logger-options error serialiser', () => {
  describe('in non-prod environments', () => {
    // Default test environment is non-prod (CDP_ENVIRONMENT != 'prod')

    it('serialises a standard Error with message and stack', () => {
      const error = new Error('Something went wrong')
      const result = loggerOptions.serializers.error(error)

      expect(result).toEqual({
        message: 'Something went wrong',
        stack_trace: expect.stringContaining('Error: Something went wrong'),
        type: 'Error'
      })
    })

    it('serialises a Boom error with statusCode and payload', () => {
      const boom = Boom.badRequest('Invalid input')
      const result = loggerOptions.serializers.error(boom)

      expect(result).toMatchObject({
        message: 'Invalid input',
        type: 'Error',
        statusCode: 400,
        payload: {
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid input'
        }
      })
    })

    it('includes Boom data in message when data property is populated', () => {
      // When Boom is created with data parameter, it appears in the message
      const validationDetails = {
        keys: ['organisationId'],
        source: 'params'
      }
      const boom = Boom.badRequest('Validation failed', validationDetails)
      const result = loggerOptions.serializers.error(boom)

      expect(result.message).toContain('Validation failed')
      expect(result.message).toContain('data:')
      expect(result.message).toContain('organisationId')
    })

    /**
     * CURRENT BEHAVIOUR (routes using failAction)
     *
     * Routes with validation use failAction handlers like:
     *   failAction: (_request, _h, err) => { throw Boom.badData(err.message) }
     *
     * This pattern LOSES the Joi validation details because only the message
     * is passed to Boom, not the structured error details.
     *
     * Affected routes:
     * - src/routes/v1/dev/organisations/patch-by-id.js:59
     * - src/routes/v1/organisations/registrations/summary-logs/upload-completed/post.js:153
     * - src/routes/v1/organisations/registrations/summary-logs/post.js:27
     */
    it('does NOT include Joi details when failAction only passes message (current behaviour)', () => {
      const schema = Joi.object({
        organisationId: Joi.string().uuid().required(),
        name: Joi.string().min(3).required()
      })

      const { error: joiError } = schema.validate(
        { organisationId: 'not-a-uuid', name: 'ab' },
        { abortEarly: false }
      )

      // Current failAction pattern: only passes message
      const boomWithoutData = Boom.badData(joiError.message)
      const result = loggerOptions.serializers.error(boomWithoutData)

      // The message contains some info, but no structured details
      expect(result.message).toContain('organisationId')
      expect(result.message).not.toContain('data:')
    })

    /**
     * RECOMMENDED FIX
     *
     * To include Joi validation details in logs, update failAction handlers:
     *   failAction: (_request, _h, err) => { throw Boom.badData(err.message, err.details) }
     *
     * This passes the Joi details array to Boom's data parameter,
     * which the serialiser then includes in the log message.
     */
    it('DOES include Joi details when failAction passes error details to data parameter', () => {
      const schema = Joi.object({
        organisationId: Joi.string().uuid().required(),
        name: Joi.string().min(3).required()
      })

      const { error: joiError } = schema.validate(
        { organisationId: 'not-a-uuid', name: 'ab' },
        { abortEarly: false }
      )

      // FIXED failAction pattern: passes details to data parameter
      const boomWithData = Boom.badData(joiError.message, joiError.details)
      const result = loggerOptions.serializers.error(boomWithData)

      // Now the message includes the structured details
      expect(result.message).toContain('data:')
      expect(result.message).toContain('string.guid')
      expect(result.message).toContain('string.min')
    })
  })

  // Note: Production environment behavior (suppressing detailed error info)
  // is tested via the isProductionEnvironment check in the serialiser.
  // The current test environment is non-prod, so we verify non-prod behavior here.
  // Production behavior relies on the conditional at line 52 of logger-options.js

  describe('non-error values', () => {
    it('returns non-Error values unchanged', () => {
      expect(loggerOptions.serializers.error('string error')).toBe(
        'string error'
      )
      expect(loggerOptions.serializers.error(null)).toBe(null)
      expect(loggerOptions.serializers.error({ custom: 'object' })).toEqual({
        custom: 'object'
      })
    })
  })
})
