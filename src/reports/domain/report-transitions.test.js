import { REPORT_STATUS } from './report-status.js'
import {
  REPORT_STATUS_TRANSITIONS,
  isValidReportTransition
} from './report-transitions.js'

describe('REPORT_STATUS_TRANSITIONS', () => {
  it('allows in_progress to ready_to_submit', () => {
    expect(REPORT_STATUS_TRANSITIONS[REPORT_STATUS.IN_PROGRESS]).toContain(
      REPORT_STATUS.READY_TO_SUBMIT
    )
  })

  it('allows ready_to_submit to in_progress and submitted', () => {
    const allowed = REPORT_STATUS_TRANSITIONS[REPORT_STATUS.READY_TO_SUBMIT]
    expect(allowed).toContain(REPORT_STATUS.IN_PROGRESS)
    expect(allowed).toContain(REPORT_STATUS.SUBMITTED)
  })

  it('allows submitted to superseded only', () => {
    expect(REPORT_STATUS_TRANSITIONS[REPORT_STATUS.SUBMITTED]).toEqual([
      REPORT_STATUS.SUPERSEDED
    ])
  })

  it('allows no transitions from terminal states', () => {
    expect(REPORT_STATUS_TRANSITIONS[REPORT_STATUS.SUPERSEDED]).toEqual([])
    expect(REPORT_STATUS_TRANSITIONS[REPORT_STATUS.DELETED]).toEqual([])
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
      isValidReportTransition(REPORT_STATUS.DELETED, REPORT_STATUS.IN_PROGRESS)
    ).toBe(false)
  })
})
