import {
  EXPORTER_REPORT_MANDATORY_RULES,
  EXPORTER_REPORT_MANDATORY_UNFILLED_VALUES,
  reportMandatorySpecFor
} from './report-mandatory-rules.js'
import { OPERATOR_CATEGORY } from '#reports/domain/operator-category.js'

/**
 * The mandatory set the exporter rules must enforce, transcribed from
 * notes/plans/PAE-1420/mandatory-fields-reconciliation.md. This golden test
 * fails if the rules drift from the agreed policy — the row-firing behaviour
 * itself is proven end-to-end in reports/routes/post.test.js.
 */
const EXPECTED_REQUIRED_FIELDS_BY_RULE = {
  AC1: [
    'SUPPLIER_NAME',
    'SUPPLIER_ADDRESS',
    'SUPPLIER_POSTCODE',
    'SUPPLIER_EMAIL',
    'SUPPLIER_PHONE_NUMBER',
    'ACTIVITIES_CARRIED_OUT_BY_SUPPLIER'
  ],
  AC2_AC4: ['OSR_ID', 'DATE_OF_EXPORT'],
  AC5: ['INTERIM_SITE_ID'],
  AC3: [
    'FINAL_DESTINATION_NAME',
    'FINAL_DESTINATION_FACILITY_TYPE',
    'FINAL_DESTINATION_ADDRESS',
    'FINAL_DESTINATION_POSTCODE'
  ]
}

describe('EXPORTER_REPORT_MANDATORY_RULES', () => {
  it('matches the agreed mandatory-field reconciliation exactly', () => {
    const actual = Object.fromEntries(
      EXPORTER_REPORT_MANDATORY_RULES.map((rule) => [
        rule.id,
        rule.requiredFields
      ])
    )

    expect(actual).toEqual(EXPECTED_REQUIRED_FIELDS_BY_RULE)
  })

  it('treats the final-destination facility-type dropdown placeholder as unfilled', () => {
    expect(
      EXPORTER_REPORT_MANDATORY_UNFILLED_VALUES.FINAL_DESTINATION_FACILITY_TYPE
    ).toContain('Choose option')
  })
})

describe('reportMandatorySpecFor', () => {
  it.each([
    OPERATOR_CATEGORY.EXPORTER,
    OPERATOR_CATEGORY.EXPORTER_REGISTERED_ONLY
  ])('returns the exporter spec for %s', (category) => {
    expect(reportMandatorySpecFor(category)).toEqual({
      rules: EXPORTER_REPORT_MANDATORY_RULES,
      unfilledValues: EXPORTER_REPORT_MANDATORY_UNFILLED_VALUES
    })
  })

  it.each([
    OPERATOR_CATEGORY.REPROCESSOR,
    OPERATOR_CATEGORY.REPROCESSOR_REGISTERED_ONLY
  ])('returns null for %s (no rules yet)', (category) => {
    expect(reportMandatorySpecFor(category)).toBeNull()
  })
})
