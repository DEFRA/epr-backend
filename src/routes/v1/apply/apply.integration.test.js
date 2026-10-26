import { describe, expect } from 'vitest'
import { StatusCodes } from 'http-status-codes'

import { FORM_FIELDS_SHORT_DESCRIPTIONS } from '#common/enums/index.js'
import { createFormCollections } from '#common/helpers/collections/create-update.js'
import accreditationFixture from '#data/fixtures/accreditation.json' with { type: 'json' }
import registrationFixture from '#data/fixtures/registration.json' with { type: 'json' }
import { it } from '#vite/fixtures/server-with-real-db.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { accreditationPath } from './accreditation.js'
import { registrationPath } from './registration.js'

/**
 * @param {typeof registrationFixture | typeof accreditationFixture} fixture
 * @param {string} referenceNumber
 */
const withReferenceNumber = (fixture, referenceNumber) => {
  const payload = structuredClone(fixture)
  const field = payload.meta.definition.pages
    .flatMap((page) => page.components ?? [])
    .find(
      (component) =>
        component.shortDescription ===
        FORM_FIELDS_SHORT_DESCRIPTIONS.REFERENCE_NUMBER
    )
  payload.data.main[field.name] = referenceNumber
  return payload
}

describe('apply routes against the real collection validators', () => {
  setupAuthContext()

  it.for([
    {
      collection: 'registration',
      url: registrationPath,
      fixture: registrationFixture
    },
    {
      collection: 'accreditation',
      url: accreditationPath,
      fixture: accreditationFixture
    }
  ])(
    '$url stores a submission the collection schema accepts',
    async ({ collection, url, fixture }, { server }) => {
      await createFormCollections(server.db)

      const response = await server.inject({
        method: 'POST',
        url,
        payload: fixture
      })

      expect(response.statusCode).toBe(StatusCodes.CREATED)
      expect(
        await server.db
          .collection(collection)
          .countDocuments({ referenceNumber: '68a66ec3dabf09f3e442b2da' })
      ).toBe(1)
    }
  )

  it.for([
    {
      url: registrationPath,
      referenceNumber: '50000',
      payload: withReferenceNumber(registrationFixture, '50000')
    },
    {
      url: accreditationPath,
      referenceNumber: '500000',
      payload: withReferenceNumber(accreditationFixture, '500000')
    }
  ])(
    '$url returns 500 when the reference number fails the collection schema',
    async ({ url, referenceNumber, payload }, { server }) => {
      await createFormCollections(server.db)

      const response = await server.inject({ method: 'POST', url, payload })

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      expect(server.loggerMocks.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: `Failure on ${url} for orgId: 500000 and referenceNumber: ${referenceNumber}, mongo validation failures: referenceNumber - 'referenceNumber' must be a string and is required`
        })
      )
    }
  )
})
