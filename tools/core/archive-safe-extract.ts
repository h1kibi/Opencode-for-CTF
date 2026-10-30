import safeExtract from "./ctf-safe-extract.ts"

/**
 * Compatibility facade (tool-layer plan P0.1): ctf-safe-extract is the single
 * canonical archive implementation (fuller ZIP recovery, flag candidates,
 * binary hints). This name is kept as a thin alias for older callers; new
 * code should call ctf-safe-extract directly.
 */
export default {
  ...safeExtract,
  description: `${safeExtract.description} (Compatibility alias of ctf-safe-extract; prefer the canonical name.)`,
}
