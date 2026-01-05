import Boom from '@hapi/boom'
import Joi from 'joi'
import { describe, expect, it } from 'vitest'
import { loggerOptions } from './logger-options.js'

describe('logger-options error serialiser', () => {
  describe('in non-prod environments', () => {
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

    it('includes Joi details when failAction passes error details to data parameter', () => {
      const schema = Joi.object({
        organisationId: Joi.string().uuid().required(),
        name: Joi.string().min(3).required()
      })

      const { error: joiError } = schema.validate(
        { organisationId: 'not-a-uuid', name: 'ab' },
        { abortEarly: false }
      )

      const boomWithData = Boom.badData(joiError.message, joiError.details)
      const result = loggerOptions.serializers.error(boomWithData)

      expect(result.message).toContain('data:')
      expect(result.message).toContain('string.guid')
      expect(result.message).toContain('string.min')
    })
  })

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
