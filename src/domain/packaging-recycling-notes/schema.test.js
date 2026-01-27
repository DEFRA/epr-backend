import { describe, expect, it } from 'vitest'

import {
  prnCreatePayloadSchema,
  prnCreateResponseSchema,
  prnEntitySchema,
  prnIdParamSchema,
  prnIssuedToOrganisationSchema,
  prnOrganisationParamsSchema,
  prnStatusUpdatePayloadSchema,
  prnStatusVersionSchema,
  prnUpdatePayloadSchema
} from './schema.js'
import { PRN_STATUS } from './status.js'

describe('PRN schemas', () => {
  const validObjectId = '507f1f77bcf86cd799439011'
  const validUuid = 'b0b08519-bbc8-4222-a5c8-44d7ade5b995'

  describe('prnIssuedToOrganisationSchema', () => {
    it('validates a complete issued-to organisation', () => {
      const data = {
        _id: validObjectId,
        name: 'Test Organisation',
        tradingName: 'Test Trading'
      }

      const { error } = prnIssuedToOrganisationSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('validates without optional tradingName', () => {
      const data = {
        _id: validObjectId,
        name: 'Test Organisation'
      }

      const { error } = prnIssuedToOrganisationSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('fails without required _id', () => {
      const data = {
        name: 'Test Organisation'
      }

      const { error } = prnIssuedToOrganisationSchema.validate(data)
      expect(error).toBeDefined()
      expect(error.details[0].path).toContain('_id')
    })

    it('fails without required name', () => {
      const data = {
        _id: validObjectId
      }

      const { error } = prnIssuedToOrganisationSchema.validate(data)
      expect(error).toBeDefined()
      expect(error.details[0].path).toContain('name')
    })

    it('fails with invalid ObjectId format', () => {
      const data = {
        _id: 'invalid-id',
        name: 'Test Organisation'
      }

      const { error } = prnIssuedToOrganisationSchema.validate(data)
      expect(error).toBeDefined()
      expect(error.details[0].path).toContain('_id')
    })
  })

  describe('prnStatusVersionSchema', () => {
    it('validates a complete status version', () => {
      const data = {
        status: PRN_STATUS.DRAFT,
        createdAt: '2024-01-15T10:00:00.000Z',
        createdBy: {
          _id: validObjectId,
          name: 'Test User'
        }
      }

      const { error } = prnStatusVersionSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('validates with null createdBy', () => {
      const data = {
        status: PRN_STATUS.AWAITING_AUTHORISATION,
        createdAt: '2024-01-15T10:00:00.000Z',
        createdBy: null
      }

      const { error } = prnStatusVersionSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('fails with invalid status value', () => {
      const data = {
        status: 'invalid_status',
        createdAt: '2024-01-15T10:00:00.000Z',
        createdBy: null
      }

      const { error } = prnStatusVersionSchema.validate(data)
      expect(error).toBeDefined()
      expect(error.details[0].path).toContain('status')
    })

    it.each(Object.values(PRN_STATUS))('accepts valid status: %s', (status) => {
      const data = {
        status,
        createdAt: '2024-01-15T10:00:00.000Z',
        createdBy: null
      }

      const { error } = prnStatusVersionSchema.validate(data)
      expect(error).toBeUndefined()
    })
  })

  describe('prnCreatePayloadSchema', () => {
    it('validates a complete create payload', () => {
      const data = {
        organisationId: validUuid,
        accreditationId: validUuid
      }

      const { error } = prnCreatePayloadSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('fails without organisationId', () => {
      const data = {
        accreditationId: validUuid
      }

      const { error } = prnCreatePayloadSchema.validate(data)
      expect(error).toBeDefined()
      expect(error.details[0].path).toContain('organisationId')
    })

    it('fails without accreditationId', () => {
      const data = {
        organisationId: validUuid
      }

      const { error } = prnCreatePayloadSchema.validate(data)
      expect(error).toBeDefined()
      expect(error.details[0].path).toContain('accreditationId')
    })

    it('fails with invalid UUID format', () => {
      const data = {
        organisationId: 'not-a-uuid',
        accreditationId: validUuid
      }

      const { error } = prnCreatePayloadSchema.validate(data)
      expect(error).toBeDefined()
      expect(error.details[0].path).toContain('organisationId')
    })
  })

  describe('prnCreateResponseSchema', () => {
    it('validates a complete response', () => {
      const data = {
        prnId: validUuid
      }

      const { error } = prnCreateResponseSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('fails without prnId', () => {
      const data = {}

      const { error } = prnCreateResponseSchema.validate(data)
      expect(error).toBeDefined()
      expect(error.details[0].path).toContain('prnId')
    })
  })

  describe('prnUpdatePayloadSchema', () => {
    it('validates a complete update payload', () => {
      const data = {
        tonnage: 100.5,
        issuedToOrganisation: {
          id: validUuid,
          name: 'Recipient Org',
          tradingName: 'Recipient Trading'
        },
        notes: 'Test notes'
      }

      const { error } = prnUpdatePayloadSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('validates with only tonnage', () => {
      const data = {
        tonnage: 50.25
      }

      const { error } = prnUpdatePayloadSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('validates with only issuedToOrganisation', () => {
      const data = {
        issuedToOrganisation: {
          id: validUuid,
          name: 'Recipient Org'
        }
      }

      const { error } = prnUpdatePayloadSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('validates with only notes', () => {
      const data = {
        notes: 'REF: 12345'
      }

      const { error } = prnUpdatePayloadSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('validates with empty notes', () => {
      const data = {
        notes: ''
      }

      const { error } = prnUpdatePayloadSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('validates empty payload', () => {
      const data = {}

      const { error } = prnUpdatePayloadSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('fails with negative tonnage', () => {
      const data = {
        tonnage: -10
      }

      const { error } = prnUpdatePayloadSchema.validate(data)
      expect(error).toBeDefined()
      expect(error.details[0].path).toContain('tonnage')
    })

    it('fails with notes exceeding 200 characters', () => {
      const data = {
        notes: 'a'.repeat(201)
      }

      const { error } = prnUpdatePayloadSchema.validate(data)
      expect(error).toBeDefined()
      expect(error.details[0].path).toContain('notes')
    })

    it('fails with missing required fields in issuedToOrganisation', () => {
      const data = {
        issuedToOrganisation: {
          id: validUuid
        }
      }

      const { error } = prnUpdatePayloadSchema.validate(data)
      expect(error).toBeDefined()
      expect(error.details[0].path).toContain('name')
    })
  })

  describe('prnStatusUpdatePayloadSchema', () => {
    it.each(Object.values(PRN_STATUS))('validates status: %s', (status) => {
      const data = { status }

      const { error } = prnStatusUpdatePayloadSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('fails without status', () => {
      const data = {}

      const { error } = prnStatusUpdatePayloadSchema.validate(data)
      expect(error).toBeDefined()
      expect(error.details[0].path).toContain('status')
    })

    it('fails with invalid status', () => {
      const data = { status: 'invalid_status' }

      const { error } = prnStatusUpdatePayloadSchema.validate(data)
      expect(error).toBeDefined()
      expect(error.details[0].path).toContain('status')
    })
  })

  describe('prnIdParamSchema', () => {
    it('validates a valid UUID', () => {
      const data = { id: validUuid }

      const { error } = prnIdParamSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('fails without id', () => {
      const data = {}

      const { error } = prnIdParamSchema.validate(data)
      expect(error).toBeDefined()
      expect(error.details[0].path).toContain('id')
    })

    it('fails with invalid UUID', () => {
      const data = { id: 'not-a-uuid' }

      const { error } = prnIdParamSchema.validate(data)
      expect(error).toBeDefined()
      expect(error.details[0].path).toContain('id')
    })
  })

  describe('prnOrganisationParamsSchema', () => {
    it('validates complete params', () => {
      const data = {
        organisationId: validUuid,
        id: validUuid
      }

      const { error } = prnOrganisationParamsSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('fails without organisationId', () => {
      const data = { id: validUuid }

      const { error } = prnOrganisationParamsSchema.validate(data)
      expect(error).toBeDefined()
      expect(error.details[0].path).toContain('organisationId')
    })

    it('fails without id', () => {
      const data = { organisationId: validUuid }

      const { error } = prnOrganisationParamsSchema.validate(data)
      expect(error).toBeDefined()
      expect(error.details[0].path).toContain('id')
    })
  })

  describe('prnEntitySchema', () => {
    const validEntity = {
      _id: validObjectId,
      organisationId: validObjectId,
      registrationId: validObjectId,
      accreditationId: validObjectId,
      schemaVersion: 1,
      createdAt: '2024-01-15T10:00:00.000Z',
      createdBy: {
        _id: validObjectId,
        name: 'Test User'
      },
      updatedAt: null,
      updatedBy: null,
      isExport: false,
      isDecemberWaste: false,
      prnNumber: 'PRN-2024-001',
      accreditationYear: 2024,
      tonnage: 100.5,
      notes: 'Test notes',
      issuedTo: null,
      authorisedAt: null,
      authorisedBy: null,
      status: [
        {
          status: PRN_STATUS.DRAFT,
          createdAt: '2024-01-15T10:00:00.000Z',
          createdBy: {
            _id: validObjectId,
            name: 'Test User'
          }
        }
      ]
    }

    it('validates a complete PRN entity', () => {
      const { error } = prnEntitySchema.validate(validEntity)
      expect(error).toBeUndefined()
    })

    it('validates entity with issuedTo organisation', () => {
      const data = {
        ...validEntity,
        issuedTo: {
          _id: validObjectId,
          name: 'Recipient Org',
          tradingName: 'Recipient Trading'
        }
      }

      const { error } = prnEntitySchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('validates entity with authorisation details', () => {
      const data = {
        ...validEntity,
        authorisedAt: '2024-01-16T10:00:00.000Z',
        authorisedBy: {
          _id: validObjectId,
          organisationId: validObjectId,
          name: 'Authoriser',
          position: 'Director'
        }
      }

      const { error } = prnEntitySchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('fails with accreditationYear below 2000', () => {
      const data = {
        ...validEntity,
        accreditationYear: 1999
      }

      const { error } = prnEntitySchema.validate(data)
      expect(error).toBeDefined()
      expect(error.details[0].path).toContain('accreditationYear')
    })

    it('fails with accreditationYear above 2100', () => {
      const data = {
        ...validEntity,
        accreditationYear: 2101
      }

      const { error } = prnEntitySchema.validate(data)
      expect(error).toBeDefined()
      expect(error.details[0].path).toContain('accreditationYear')
    })

    it('fails with non-integer schemaVersion', () => {
      const data = {
        ...validEntity,
        schemaVersion: 1.5
      }

      const { error } = prnEntitySchema.validate(data)
      expect(error).toBeDefined()
      expect(error.details[0].path).toContain('schemaVersion')
    })

    it('fails with schemaVersion less than 1', () => {
      const data = {
        ...validEntity,
        schemaVersion: 0
      }

      const { error } = prnEntitySchema.validate(data)
      expect(error).toBeDefined()
      expect(error.details[0].path).toContain('schemaVersion')
    })

    it('fails without required _id', () => {
      const { _id, ...data } = validEntity

      const { error } = prnEntitySchema.validate(data)
      expect(error).toBeDefined()
      expect(error.details[0].path).toContain('_id')
    })

    it('fails without required status array', () => {
      const { status: _status, ...data } = validEntity

      const { error } = prnEntitySchema.validate(data)
      expect(error).toBeDefined()
      expect(error.details[0].path).toContain('status')
    })
  })
})
