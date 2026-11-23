import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { partialMock } from '#test/type-helpers.js'

import { hashClassificationContext } from './classification-context-hash.js'

/** @import { ClassificationContext } from '#domain/summary-logs/table-schemas/validation-pipeline.js' */
/** @import { AccreditationValidity } from '#domain/organisations/accreditation.js' */

/** @type {AccreditationValidity} */
const accreditation = {
  timeline: [{ status: 'approved', at: '2026-01-01T00:00:00.000Z' }],
  validFrom: '2026-01-01',
  validTo: '2026-12-31'
}

/**
 * @param {Date | null} [site200ValidFrom]
 * @returns {ClassificationContext}
 */
const exporterContext = (site200ValidFrom = new Date('2026-06-01')) => ({
  accreditation,
  overseasSites: {
    100: { validFrom: new Date('2026-01-01') },
    200: { validFrom: site200ValidFrom }
  }
})

describe('hashClassificationContext', () => {
  it('reads the same context the same way whatever order its keys arrive in', () => {
    /** @type {ClassificationContext} */
    const reordered = {
      overseasSites: {
        200: { validFrom: new Date('2026-06-01') },
        100: { validFrom: new Date('2026-01-01') }
      },
      accreditation: {
        validTo: '2026-12-31',
        validFrom: '2026-01-01',
        timeline: accreditation.timeline
      }
    }

    expect(hashClassificationContext(reordered)).toBe(
      hashClassificationContext(exporterContext())
    )
  })

  it('reads an overseas site approved on a different date as a different context', () => {
    expect(
      hashClassificationContext(exporterContext(new Date('2026-01-01')))
    ).not.toBe(hashClassificationContext(exporterContext()))
  })

  it('reads a site that is no longer approved as a different context', () => {
    expect(hashClassificationContext(exporterContext(null))).not.toBe(
      hashClassificationContext(exporterContext())
    )
  })

  it('hashes a context with no previous year position as it did before the position existed', () => {
    expect(hashClassificationContext(exporterContext())).toBe(
      '1026bf230e28907fb685d39bc3ccc2fa55e202116c5dbfc77b80c4af94a6659c'
    )
  })

  it('leaves the table schemas out', () => {
    expect(
      hashClassificationContext({
        ...exporterContext(),
        tableSchemas: partialMock({ RECEIVED_LOADS_FOR_EXPORT: {} })
      })
    ).toBe(hashClassificationContext(exporterContext()))
  })

  it.each([
    [14, 16],
    [null, 14]
  ])(
    'reads a previous year position of %s as a different context from %s',
    (position, other) => {
      expect(
        hashClassificationContext({
          ...exporterContext(),
          previousYearPosition: position
        })
      ).not.toBe(
        hashClassificationContext({
          ...exporterContext(),
          previousYearPosition: other
        })
      )
    }
  )

  it('tells a previous year with no submission from a template that does not link years', () => {
    expect(
      hashClassificationContext({
        ...exporterContext(),
        previousYearPosition: null
      })
    ).not.toBe(hashClassificationContext(exporterContext()))
  })

  it('tells a registered-only context from an accredited one with no overseas sites', () => {
    expect(
      hashClassificationContext({
        accreditation: null,
        overseasSites: ORS_VALIDATION_DISABLED
      })
    ).not.toBe(
      hashClassificationContext({ accreditation: null, overseasSites: {} })
    )
  })
})
