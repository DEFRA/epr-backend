/**
 * Public Register Module
 *
 * This module contains the application, repository and route layers for the
 * public register.
 *
 * @module public-register
 */

// Route exports
export { generateLatestPublicRegister } from './routes/generate-post.js'

// Repositories
export { s3PublicRegisterRepositoryPlugin } from './repository/s3.plugin.js'
