import { REPORT_STATUS } from './report-status.js'
import {
  REPORT_STATUS_TRANSITIONS,
  isValidReportTransition
} from './report-transitions.js'

describe('REPORT_STATUS_TRANSITIONS', () => {
  it('allows in_progress to ready_to_submit only', () => {
    const allowed = REPORT_STATUS_TRANSITIONS[REPORT_STATUS.IN_PROGRESS]
    expect(allowed).toContain(REPORT_STATUS.READY_TO_SUBMIT)
    expect(allowed).toHaveLength(1)
  })

  it('allows ready_to_submit to submitted only', () => {
    const allowed = REPORT_STATUS_TRANSITIONS[REPORT_STATUS.READY_TO_SUBMIT]
    expect(allowed).toContain(REPORT_STATUS.SUBMITTED)
    expect(allowed).toHaveLength(1)
  })

  it('allows no transitions from submitted', () => {
    expect(REPORT_STATUS_TRANSITIONS[REPORT_STATUS.SUBMITTED]).toEqual([])
  })
})

describe('#isValidReportTransition', () => {
  it('returns true for allowed transition', () => {
    expect(
      isValidReportTransition(
        REPORT_STATUS.IN_PROGRESS,
        REPORT_STATUS.READY_TO_SUBMIT
      )
    ).toBe(true)
  })

  it('returns false for disallowed transition', () => {
    expect(
      isValidReportTransition(
        REPORT_STATUS.IN_PROGRESS,
        REPORT_STATUS.SUBMITTED
      )
    ).toBe(false)
  })

  it('returns false for unknown current status', () => {
    expect(isValidReportTransition('unknown', REPORT_STATUS.SUBMITTED)).toBe(
      false
    )
  })

  it('returns false for transition from terminal state', () => {
    expect(
      isValidReportTransition(
        REPORT_STATUS.SUBMITTED,
        REPORT_STATUS.IN_PROGRESS
      )
    ).toBe(false)
  })
})
