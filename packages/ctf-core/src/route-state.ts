/** Canonical Evidence route lifecycle. Order is meaningful: progression order. */
export const CASE_ROUTE_STATES = ["untested", "blocked", "dead", "live"] as const

export type CaseRouteState = (typeof CASE_ROUTE_STATES)[number]

/**
 * A route stops counting as active only after evidence proves the direction
 * wrong. `blocked` stays active on purpose: an obstacle can sit on a correct
 * path, so treating it as inactive would drop a viable route.
 */
export const INACTIVE_ROUTE_STATE: CaseRouteState = "dead"
