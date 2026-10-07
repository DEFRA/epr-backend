import { uploadCompletedPath } from './natural-key-paths.js'

const keys = {
  organisationNumber: 500123,
  registrationNumber: 'R26ER5001180041PL',
  year: 2026,
  summaryLogId: 'log-1'
}

describe('uploadCompletedPath', () => {
  it('calls back a registered-only upload under the registration and year', () => {
    expect(uploadCompletedPath({ ...keys, accredited: false })).toBe(
      '/organisations/500123/registrations/R26ER5001180041PL/summary-logs/2026/log-1/upload-completed'
    )
  })

  it("calls back an accredited upload under the registration's accreditation for the year", () => {
    expect(uploadCompletedPath({ ...keys, accredited: true })).toBe(
      '/organisations/500123/registrations/R26ER5001180041PL/accreditations/2026/summary-log/log-1/upload-completed'
    )
  })
})
