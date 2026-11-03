/** @import {OverseasSitesContext} from '#waste-balances/domain/classification-context.js' */

/**
 * One approved site in the context: `approvedFrom` is used by
 * classifyForWasteBalance, `name` populates OSR_NAME_REVISED and `country`
 * OSR_COUNTRY_REVISED.
 *
 * @typedef {Exclude<OverseasSitesContext, symbol>[string]} OverseasSiteContextEntry
 */
