/**
 * @typedef {'disabled' | 'enabled' | 'dry-run'} GlassMigrationMode
 */

/**
 * @typedef {'disabled' | 'enabled' | 'dry-run'} WasteBalanceRoundingCorrectionMode
 */

/**
 * @typedef {Object} FeatureFlags
 * @property {() => boolean} isDevEndpointsEnabled
 * @property {() => boolean} isFormsDataMigrationEnabled
 * @property {() => GlassMigrationMode} getGlassMigrationMode
 * @property {() => WasteBalanceRoundingCorrectionMode} getWasteBalanceRoundingCorrectionMode
 * @property {() => boolean} isLogFileUploadsFromFormsEnabled
 * @property {() => boolean} isCreatePackagingRecyclingNotesEnabled
 * @property {() => boolean} isPackagingRecyclingNotesExternalApiEnabled
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
