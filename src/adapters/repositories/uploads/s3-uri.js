const S3_SCHEME = 's3://'

/**
 * Splits an S3 URI into bucket and key. Not a URL parse: S3 keys are literal,
 * so dot segments, `?`, `#` and `%` stay in the key as they were stored.
 * @param {string} uri - S3 URI in format s3://bucket/key
 * @returns {{ Bucket: string, Key: string }} S3 location object
 * @throws {Error} If URI is malformed or missing required components
 */
export const parseS3Uri = (uri) => {
  if (!uri.startsWith(S3_SCHEME)) {
    throw new Error(`Not an s3:// URI: ${uri}`)
  }

  const [bucket, ...keySegments] = uri.slice(S3_SCHEME.length).split('/')
  const key = keySegments.join('/')

  if (!bucket) {
    throw new Error(`Missing bucket in S3 URI: ${uri}`)
  }

  if (!key) {
    throw new Error(`Missing key in S3 URI: ${uri}`)
  }

  return { Bucket: bucket, Key: key }
}

/**
 * @param {string} uri - S3 URI in format s3://bucket/key
 * @param {string[]} uploadBuckets - the buckets uploads are delivered to
 * @returns {{ Bucket: string, Key: string }} S3 location object
 * @throws {Error} If the URI is malformed or names another bucket
 */
export const parseUploadUri = (uri, uploadBuckets) => {
  const location = parseS3Uri(uri)

  if (!uploadBuckets.includes(location.Bucket)) {
    throw new Error(`Not an upload bucket: ${uri}`)
  }

  return location
}
