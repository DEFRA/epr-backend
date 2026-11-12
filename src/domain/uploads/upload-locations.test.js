import { describe, expect, it } from 'vitest'

import { isInUploadLocation, toUploadPath } from './upload-locations.js'

const location = {
  bucket: 're-ex-summary-logs',
  path: toUploadPath('/organisations/org-1/registrations/reg-1')
}

describe('upload locations', () => {
  describe('#isInUploadLocation', () => {
    it('should accept a completed file under the path in the bucket', () => {
      const file = {
        fileStatus: 'complete',
        s3Bucket: 're-ex-summary-logs',
        s3Key: '/organisations/org-1/registrations/reg-1/upload-1/file-1'
      }

      expect(isInUploadLocation(file, location)).toBe(true)
    })

    it.for(['pending', 'rejected'])(
      'should accept a %s file, which names no location',
      (fileStatus) => {
        expect(isInUploadLocation({ fileStatus }, location)).toBe(true)
      }
    )

    it.for([
      {
        description: 'in another bucket',
        s3Bucket: 'some-other-bucket',
        s3Key: '/organisations/org-1/registrations/reg-1/upload-1/file-1'
      },
      {
        description: 'under another registration',
        s3Bucket: 're-ex-summary-logs',
        s3Key: '/organisations/org-1/registrations/reg-2/upload-1/file-1'
      },
      {
        description: 'under an id that starts with this one',
        s3Bucket: 're-ex-summary-logs',
        s3Key: '/organisations/org-1/registrations/reg-10/upload-1/file-1'
      },
      {
        description: 'at the folder itself',
        s3Bucket: 're-ex-summary-logs',
        s3Key: '/organisations/org-1/registrations/reg-1'
      },
      {
        description: 'with no key',
        s3Bucket: 're-ex-summary-logs',
        s3Key: undefined
      }
    ])('should refuse a completed file $description', ({ s3Bucket, s3Key }) => {
      const file = { fileStatus: 'complete', s3Bucket, s3Key }

      expect(isInUploadLocation(file, location)).toBe(false)
    })
  })
})
