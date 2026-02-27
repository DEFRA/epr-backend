/**
 * @typedef {'disabled' | 'enabled' | 'dry-run'} GlassMigrationMode
 */

/**
 * @typedef {Object} FeatureFlags
 * @property {() => boolean} isDevEndpointsEnabled
 * @property {() => boolean} isFormsDataMigrationEnabled
 * @property {() => GlassMigrationMode} getGlassMigrationMode
 * @property {() => boolean} isLogFileUploadsFromFormsEnabled
 * @property {() => boolean} isCreatePackagingRecyclingNotesEnabled
 * @property {() => boolean} isPackagingRecyclingNotesExternalApiEnabled
 * @property {() => boolean} isOverseasSitesEnabled
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
