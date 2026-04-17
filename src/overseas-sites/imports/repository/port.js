/**
 * @typedef {Object} OrsImportFile
 * @property {string} fileId - CDP uploader file ID
 * @property {string} fileName - Original file name
 * @property {string} s3Uri - S3 URI for the uploaded file
 * @property {object|null} [result] - Processing result (null until processed)
 */

/**
 * @typedef {Object} OrsImport
 * @property {string} _id
 * @property {string} status - 'preprocessing' | 'processing' | 'completed' | 'failed'
 * @property {OrsImportFile[]} files
 * @property {{ id: string, email: string, scope: string[] }} [createdBy] - User who initiated the import
 * @property {string} createdAt - ISO 8601 date string
 * @property {string} updatedAt - ISO 8601 date string
 * @property {Date|null} expiresAt - TTL expiry date, null for completed imports
 */

/**
 * @typedef {Object} OrsImportsRepository
 * @property {(importDoc: Omit<OrsImport, 'createdAt' | 'updatedAt' | 'expiresAt'>) => Promise<OrsImport>} create
 * @property {(id: string) => Promise<OrsImport|null>} findById
 * @property {(id: string, files: OrsImportFile[]) => Promise<void>} addFiles
 * @property {(id: string, status: string) => Promise<boolean>} updateStatus
 * @property {(id: string, fileIndex: number, result: object) => Promise<void>} recordFileResult
 */

/**
 * @typedef {() => OrsImportsRepository} OrsImportsRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
