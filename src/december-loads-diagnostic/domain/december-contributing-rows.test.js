import {
  accreditationDecemberKey,
  countDecemberContributingRows
} from './december-contributing-rows.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

/**
 * A received (crediting) row for a reprocessor-input accreditation, bucketed by
 * DATE_RECEIVED_FOR_REPROCESSING.
 *
 * @param {string} date
 * @returns {any}
 */
const receivedRow = (date) => ({
  rowId: `received-${date}`,
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  data: {
    DATE_RECEIVED_FOR_REPROCESSING: date,
    TONNAGE_RECEIVED_FOR_RECYCLING: 10
  },
  classification: {}
})

/**
 * A sent-on (deducting) row for a reprocessor-input accreditation, bucketed by
 * DATE_LOAD_LEFT_SITE. It still affects the December portion, in the opposite
 * direction, so it counts.
 *
 * @param {string} date
 * @returns {any}
 */
const sentOnRow = (date) => ({
  rowId: `sent-on-${date}`,
  wasteRecordType: WASTE_RECORD_TYPE.SENT_ON,
  data: {
    DATE_LOAD_LEFT_SITE: date,
    TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 4
  },
  classification: {}
})

/**
 * An exported (crediting) row for an exporter accreditation, bucketed by the
 * date the overseas reprocessor received it.
 *
 * @param {string} dateReceivedByOsr
 * @returns {any}
 */
const exportedRow = (dateReceivedByOsr) => ({
  rowId: `exported-${dateReceivedByOsr}`,
  wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
  data: {
    DATE_RECEIVED_BY_OSR: dateReceivedByOsr,
    TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 10,
    DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE: 'No'
  },
  classification: {}
})

/**
 * A processed row for a reprocessor-output accreditation, bucketed by
 * DATE_LOAD_LEFT_SITE. Output never accrues December, so even a December-dated
 * processed row must not count.
 *
 * @param {string} date
 * @returns {any}
 */
const processedRow = (date) => ({
  rowId: `processed-${date}`,
  wasteRecordType: WASTE_RECORD_TYPE.PROCESSED,
  data: {
    DATE_LOAD_LEFT_SITE: date,
    PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: 10
  },
  classification: {}
})

describe('accreditationDecemberKey', () => {
  it('is the December of the accreditation validFrom year', () => {
    expect(accreditationDecemberKey({ validFrom: '2026-01-01' })).toBe(
      '2026-12'
    )
  })

  it('reads only the year, so any validFrom month resolves to that December', () => {
    expect(accreditationDecemberKey({ validFrom: '2025-07-15' })).toBe(
      '2025-12'
    )
  })

  it('is null when validFrom is absent', () => {
    expect(accreditationDecemberKey({})).toBeNull()
  })

  it('is null when validFrom is not a usable date string', () => {
    expect(accreditationDecemberKey({ validFrom: '26' })).toBeNull()
  })
})

describe('countDecemberContributingRows', () => {
  it('counts exporter loads received by the OSR in the accreditation December', () => {
    const rows = [
      exportedRow('2026-12-05'),
      exportedRow('2026-06-10'),
      exportedRow('2026-12-31')
    ]

    expect(
      countDecemberContributingRows(rows, PROCESSING_TYPES.EXPORTER, '2026-12')
    ).toBe(2)
  })

  it('counts reprocessor-input received and sent-on December rows, either direction', () => {
    const rows = [
      receivedRow('2026-12-01'),
      sentOnRow('2026-12-20'),
      receivedRow('2026-06-01')
    ]

    expect(
      countDecemberContributingRows(
        rows,
        PROCESSING_TYPES.REPROCESSOR_INPUT,
        '2026-12'
      )
    ).toBe(2)
  })

  it('counts only December rows of the accreditation year, not another year December', () => {
    const rows = [receivedRow('2025-12-01'), receivedRow('2026-12-01')]

    expect(
      countDecemberContributingRows(
        rows,
        PROCESSING_TYPES.REPROCESSOR_INPUT,
        '2026-12'
      )
    ).toBe(1)
  })

  it('never counts reprocessor-output rows, even December-dated processed loads', () => {
    const rows = [processedRow('2026-12-05'), processedRow('2026-12-25')]

    expect(
      countDecemberContributingRows(
        rows,
        PROCESSING_TYPES.REPROCESSOR_OUTPUT,
        '2026-12'
      )
    ).toBe(0)
  })

  it('ignores rows that do not contribute under the accreditation type', () => {
    const rows = [sentOnRow('2026-12-10')]

    expect(
      countDecemberContributingRows(rows, PROCESSING_TYPES.EXPORTER, '2026-12')
    ).toBe(0)
  })

  it('ignores contributing rows whose date is missing or unparseable', () => {
    const rows = [receivedRow('not-a-date'), { ...receivedRow('x'), data: {} }]

    expect(
      countDecemberContributingRows(
        rows,
        PROCESSING_TYPES.REPROCESSOR_INPUT,
        '2026-12'
      )
    ).toBe(0)
  })

  it('is zero when the December key is null', () => {
    const rows = [receivedRow('2026-12-01')]

    expect(
      countDecemberContributingRows(
        rows,
        PROCESSING_TYPES.REPROCESSOR_INPUT,
        null
      )
    ).toBe(0)
  })
})
