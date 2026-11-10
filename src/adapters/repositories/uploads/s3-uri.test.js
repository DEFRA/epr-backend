import { describe, expect, it } from 'vitest'
import { parseS3Uri } from './s3-uri.js'

describe('parseS3Uri', () => {
  it.for(['not a valid uri', 'https://bucket/key', 'S3://bucket/key'])(
    'rejects %s, which is not an s3:// URI',
    (uri) => {
      expect(() => parseS3Uri(uri)).toThrow(`Not an s3:// URI: ${uri}`)
    }
  )

  it('rejects URI with empty bucket', () => {
    expect(() => parseS3Uri('s3:///key')).toThrow(
      'Missing bucket in S3 URI: s3:///key'
    )
  })

  it('rejects URI with empty key', () => {
    expect(() => parseS3Uri('s3://bucket/')).toThrow(
      'Missing key in S3 URI: s3://bucket/'
    )
  })

  it('rejects URI with missing key', () => {
    expect(() => parseS3Uri('s3://bucket')).toThrow(
      'Missing key in S3 URI: s3://bucket'
    )
  })

  it('correctly handles keys with slashes', () => {
    const result = parseS3Uri('s3://bucket/path/to/file.csv')

    expect(result).toStrictEqual({
      Bucket: 'bucket',
      Key: 'path/to/file.csv'
    })
  })

  it.for([
    {
      description: 'a leading slash',
      key: '/organisations/org-1/registrations/reg-1/upload-1/file-1'
    },
    {
      description: 'dot segments',
      key: '/organisations/org-1/registrations/reg-1/../../../org-2/registrations/reg-2/file-1'
    },
    {
      description: 'encoded dot segments',
      key: '/organisations/org-1/registrations/reg-1/%2e%2e/%2E%2E/%2e%2e/org-2/file-1'
    },
    { description: 'a question mark', key: 'path/what?.xlsx' },
    { description: 'a hash', key: 'path/number#1.xlsx' },
    { description: 'spaces', key: 'path/summary log.xlsx' },
    { description: 'percent sequences', key: 'path/100%41.xlsx' }
  ])('keeps a key with $description exactly as stored', ({ key }) => {
    expect(parseS3Uri(`s3://bucket/${key}`)).toStrictEqual({
      Bucket: 'bucket',
      Key: key
    })
  })
})
