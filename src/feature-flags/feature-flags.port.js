/**
 * @typedef {Object} FeatureFlags
 * @property {() => boolean} isDevEndpointsEnabled
 * @property {() => boolean} isFixDuplicateAccreditationLinksEnabled
 * @property {() => boolean} isSummaryLogRowStatesEnabled
 * @property {() => boolean} isSummaryLogRowStatesBackfillEnabled
 * @property {() => boolean} isSummaryLogRowStatesDiscrepancyReportEnabled
 * @property {() => boolean} isRegisteredOnlySubmittedEventsEnabled
 * @property {() => boolean} isStaleIssuedTonnageReportEnabled
 */

/**
 * @typedef {Object} FeatureFlagOverrides
 * @property {boolean} [devEndpoints]
 * @property {boolean} [fixDuplicateAccreditationLinks]
 * @property {boolean} [summaryLogRowStates]
 * @property {boolean} [summaryLogRowStatesBackfill]
 * @property {boolean} [summaryLogRowStatesDiscrepancyReport]
 * @property {boolean} [registeredOnlySubmittedEvents]
 * @property {boolean} [staleIssuedTonnageReport]
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
