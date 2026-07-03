/**
 * @typedef {Object} FeatureFlags
 * @property {() => boolean} isDevEndpointsEnabled
 * @property {() => boolean} isCopyFormFilesToS3Enabled
 * @property {() => boolean} isFixDuplicateAccreditationLinksEnabled
 * @property {() => boolean} isWasteRecordStatesEnabled
 * @property {() => boolean} isWasteRecordStatesBackfillEnabled
 * @property {() => boolean} isRegisteredOnlySubmittedEventsEnabled
 */

/**
 * @typedef {Object} FeatureFlagOverrides
 * @property {boolean} [devEndpoints]
 * @property {boolean} [copyFormFilesToS3]
 * @property {boolean} [fixDuplicateAccreditationLinks]
 * @property {boolean} [wasteRecordStates]
 * @property {boolean} [wasteRecordStatesBackfill]
 * @property {boolean} [registeredOnlySubmittedEvents]
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
