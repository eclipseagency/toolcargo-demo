/**
 * Demo edition: the production module runs entitlement, rate-limit, quota and usage
 * accounting against a database. The portfolio demo keeps only the error type the
 * connectors share; there is no metering, billing or account system here.
 */
export class UserFacingError extends Error {}
