import { describe, it, expect } from 'vitest'
import {
  REPROCESSING_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import {
  addFigures,
  monthlyContribution,
  NO_FIGURES,
  withNetCredit
} from './waste-balance-figures.js'

const REPROCESSOR_INPUT = {
  wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
  reprocessingType: REPROCESSING_TYPE.INPUT
}
const EXPORTER = { wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER }

const included = (transactionAmount) => ({
  outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
  reasons: [],
  transactionAmount
})

const excluded = {
  outcome: WASTE_BALANCE_OUTCOME.EXCLUDED,
  reasons: [],
  transactionAmount: 0
}

const receivedRow = (data, classification) => ({
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  data,
  classification
})

describe('addFigures', () => {
  it('sums each figure without floating-point drift', () => {
    expect(
      addFigures(
        { totalCredited: 0.1, eligibleForWasteBalance: 1, sentOnDeductions: 3 },
        {
          totalCredited: 0.2,
          eligibleForWasteBalance: 0,
          sentOnDeductions: 4.5
        }
      )
    ).toEqual({
      totalCredited: 0.3,
      eligibleForWasteBalance: 1,
      sentOnDeductions: 7.5
    })
  })

  it('leaves figures unchanged when nothing is added to them', () => {
    const figures = {
      totalCredited: 12.34,
      eligibleForWasteBalance: 10,
      sentOnDeductions: 2.5
    }

    expect(addFigures(figures, NO_FIGURES)).toEqual(figures)
  })
})

describe('withNetCredit', () => {
  it('subtracts the sent-on deductions from the eligible tonnage', () => {
    expect(
      withNetCredit({
        totalCredited: 120,
        eligibleForWasteBalance: 100,
        sentOnDeductions: 30
      })
    ).toEqual({
      totalCredited: 120,
      eligibleForWasteBalance: 100,
      sentOnDeductions: 30,
      netCredit: 70
    })
  })

  it('goes negative when more was sent on than was eligible', () => {
    expect(
      withNetCredit({
        totalCredited: 10,
        eligibleForWasteBalance: 10,
        sentOnDeductions: 25
      }).netCredit
    ).toBe(-15)
  })
})

describe('monthlyContribution', () => {
  it('credits a received load to the month it was received for reprocessing', () => {
    expect(
      monthlyContribution(
        receivedRow(
          {
            DATE_RECEIVED_FOR_REPROCESSING: '2026-03-14',
            TONNAGE_RECEIVED_FOR_RECYCLING: 40
          },
          included(40)
        ),
        REPROCESSOR_INPUT
      )
    ).toEqual({
      month: '2026-03',
      deducts: false,
      figures: {
        totalCredited: 40,
        eligibleForWasteBalance: 40,
        sentOnDeductions: 0
      }
    })
  })

  it('counts an excluded row towards the gross credit but not the eligible tonnage', () => {
    expect(
      monthlyContribution(
        receivedRow(
          {
            DATE_RECEIVED_FOR_REPROCESSING: '2026-03-14',
            TONNAGE_RECEIVED_FOR_RECYCLING: 40
          },
          excluded
        ),
        REPROCESSOR_INPUT
      )?.figures
    ).toEqual({
      totalCredited: 40,
      eligibleForWasteBalance: 0,
      sentOnDeductions: 0
    })
  })

  it('reads the eligible tonnage from the classification rather than the row', () => {
    expect(
      monthlyContribution(
        receivedRow(
          {
            DATE_RECEIVED_FOR_REPROCESSING: '2026-03-14',
            TONNAGE_RECEIVED_FOR_RECYCLING: 40
          },
          included(25)
        ),
        REPROCESSOR_INPUT
      )?.figures.eligibleForWasteBalance
    ).toBe(25)
  })

  it('deducts a sent-on load, positive, in the month the load left site', () => {
    expect(
      monthlyContribution(
        {
          wasteRecordType: WASTE_RECORD_TYPE.SENT_ON,
          data: {
            DATE_LOAD_LEFT_SITE: '2026-04-02',
            TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 12.5
          },
          classification: excluded
        },
        REPROCESSOR_INPUT
      )
    ).toEqual({
      month: '2026-04',
      deducts: true,
      figures: {
        totalCredited: 0,
        eligibleForWasteBalance: 0,
        sentOnDeductions: 12.5
      }
    })
  })

  it('contributes nothing from a table that does not count under the accreditation', () => {
    expect(
      monthlyContribution(
        receivedRow(
          {
            DATE_RECEIVED_FOR_REPROCESSING: '2026-03-14',
            TONNAGE_RECEIVED_FOR_RECYCLING: 40
          },
          included(40)
        ),
        EXPORTER
      )
    ).toBeNull()
  })

  it('places a row with no usable month-assignment date in no month', () => {
    expect(
      monthlyContribution(
        receivedRow({ TONNAGE_RECEIVED_FOR_RECYCLING: 40 }, included(40)),
        REPROCESSOR_INPUT
      )?.month
    ).toBeNull()
  })

  it('marks a sent-on row as deducting and a received row as not', () => {
    expect(
      monthlyContribution(
        {
          wasteRecordType: WASTE_RECORD_TYPE.SENT_ON,
          data: { TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 12 },
          classification: excluded
        },
        REPROCESSOR_INPUT
      )
    ).toEqual({
      month: null,
      deducts: true,
      figures: {
        totalCredited: 0,
        eligibleForWasteBalance: 0,
        sentOnDeductions: 12
      }
    })

    expect(
      monthlyContribution(
        receivedRow(
          {
            DATE_RECEIVED_FOR_REPROCESSING: '2026-03-14',
            TONNAGE_RECEIVED_FOR_RECYCLING: 40
          },
          included(40)
        ),
        REPROCESSOR_INPUT
      )?.deducts
    ).toBe(false)
  })

  it('treats a missing tonnage column as nothing rather than as not a number', () => {
    expect(
      monthlyContribution(
        receivedRow({ DATE_RECEIVED_FOR_REPROCESSING: '2026-03-14' }, excluded),
        REPROCESSOR_INPUT
      )?.figures.totalCredited
    ).toBe(0)
  })
})
