import { describe, expect, it } from 'vitest'
import { parseS3Uri } from './s3-uri.js'

describe('parseS3Uri', () => {
  it('rejects malformed URI', () => {
    expect(() => parseS3Uri('not a valid uri')).toThrow(
      'Malformed URI: not a valid uri'
    )
  })

  it('rejects non-s3 protocol', () => {
    expect(() => parseS3Uri('https://bucket/key')).toThrow(
      'Expected s3:// protocol, got: https:'
    )
  })

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

    expect(result).toEqual({
      Bucket: 'bucket',
      Key: 'path/to/file.csv'
    })
  })
})
