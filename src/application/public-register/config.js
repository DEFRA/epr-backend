import { config } from '#root/config.js'

/**
 * Public Register Configuration
 * Centralizes all public register-related configuration in one place
 */
export const publicRegisterConfig = {
  /**
   * Batch size for processing organisations during public register generation
   * Used for yielding back to event loop to prevent blocking
   */
  batchSize: Number(config.get('publicRegister.batchSize')),

  /**
   * S3 bucket name where public register CSV files are stored
   */
  s3Bucket: config.get('publicRegister.s3Bucket'),

  /**
   * Expiry time in seconds for pre-signed download URLs
   */
  preSignedUrlExpiry: Number.parseInt(
    config.get('publicRegister.preSignedUrlExpiry')
  )
}
