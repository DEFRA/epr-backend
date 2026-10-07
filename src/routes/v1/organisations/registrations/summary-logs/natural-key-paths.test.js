import { summaryLogPath } from './natural-key-paths.js'

const keys = {
  organisationNumber: 500123,
  registrationNumber: 'R26ER5001180041PL',
  year: 2026,
  summaryLogId: 'log-1'
}

describe('summaryLogPath', () => {
  it('addresses a registered-only summary log under the registration and year', () => {
    expect(summaryLogPath({ ...keys, accredited: false })).toBe(
      '/organisations/500123/registrations/R26ER5001180041PL/summary-logs/2026/log-1'
    )
  })

  it("addresses an accredited summary log under the registration's accreditation for the year", () => {
    expect(
      summaryLogPath({ ...keys, accredited: true, suffix: '/upload-completed' })
    ).toBe(
      '/organisations/500123/registrations/R26ER5001180041PL/accreditations/2026/summary-log/log-1/upload-completed'
    )
  })
})
