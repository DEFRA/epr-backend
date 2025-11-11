/**
 * Parses an S3 URI into bucket and key components
 * @param {string} uri - S3 URI in format s3://bucket/key
 * @returns {{ Bucket: string, Key: string }} S3 location object
 * @throws {Error} If URI is malformed or missing required components
 */
export const parseS3Uri = (uri) => {
  // Parse S3 URI using built-in URL class
  let url
  try {
    url = new URL(uri)
  } catch (error) {
    throw new Error(`Malformed URI: ${uri}`)
  }

  if (url.protocol !== 's3:') {
    throw new Error(`Expected s3:// protocol, got: ${url.protocol}`)
  }

  if (!url.hostname) {
    throw new Error(`Missing bucket in S3 URI: ${uri}`)
  }

  if (!url.pathname || url.pathname === '/') {
    throw new Error(`Missing key in S3 URI: ${uri}`)
  }

  return {
    Bucket: url.hostname,
    Key: url.pathname.slice(1) // Remove leading slash
  }
}
