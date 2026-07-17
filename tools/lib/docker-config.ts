/**
 * Docker image configuration with environment-variable overrides.
 *
 * Default images use the `pwnlab:*` / `revlab:*` convention but users can
 * override the image prefix or pin a specific image via environment variables
 * defined in .env.example.
 *
 * Usage:
 *   import { pwnImage, revImage } from "./lib/docker-config.ts"
 *   const img = pwnImage("general-ubuntu22.04")  // "pwnlab:general-ubuntu22.04"
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolvePrefix(defaultPrefix: string, envVar: string): string {
  const override = process.env[envVar]
  return override ? override.replace(/:$/, "") : defaultPrefix
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a PWN Docker image name.
 *
 * - If `CTF_PWN_IMAGE` is set, it is returned verbatim (overrides everything).
 * - Otherwise uses `CTF_PWN_IMAGE_PREFIX` (default `pwnlab`) + `:suffix`.
 */
export function pwnImage(suffix: string): string {
  const override = process.env.CTF_PWN_IMAGE
  if (override) return override
  const prefix = resolvePrefix("pwnlab", "CTF_PWN_IMAGE_PREFIX")
  return `${prefix}:${suffix}`
}

/**
 * Resolve a REV (reverse-engineering) Docker image name.
 *
 * Uses `CTF_REV_IMAGE_PREFIX` (default `revlab`).
 */
export function revImage(suffix: string): string {
  const prefix = resolvePrefix("revlab", "CTF_REV_IMAGE_PREFIX")
  return `${prefix}:${suffix}`
}

/**
 * Map an Ubuntu version to the appropriate pwn image, service name,
 * and profile. Returns undefined for unknown versions.
 */
export function imageForUbuntuVersion(
  version: string,
): { image: string; service: string; profile: string } | undefined {
  if (version === "18.04")
    return { image: pwnImage("general-ubuntu18.04"), service: "pwn-general18", profile: "general18" }
  if (version === "20.04")
    return { image: pwnImage("general-ubuntu20.04"), service: "pwn-general20", profile: "general20" }
  if (version === "22.04") return { image: pwnImage("general-ubuntu22.04"), service: "pwn-general", profile: "general" }
  if (version === "24.04")
    return { image: pwnImage("general-ubuntu24.04"), service: "pwn-general24", profile: "general24" }
  return undefined
}

/**
 * Convenience accessors for commonly used images.
 * Each is a function so environment variables are read at call time
 * (not import time), allowing runtime overrides.
 */
export const DOCKER_IMAGES = {
  generalUbuntu2204: () => pwnImage("general-ubuntu22.04"),
  generalUbuntu2004: () => pwnImage("general-ubuntu20.04"),
  generalUbuntu1804: () => pwnImage("general-ubuntu18.04"),
  generalUbuntu2404: () => pwnImage("general-ubuntu24.04"),
  generalDebian11: () => pwnImage("general-debian11"),
  generalDebian12: () => pwnImage("general-debian12"),
  generalAlpine: () => pwnImage("general-alpine"),
  aarch64: () => pwnImage("aarch64"),
  mipsel: () => pwnImage("mipsel"),
  i386Ubuntu2004: () => pwnImage("i386-ubuntu20.04"),
  heavyUbuntu2204: () => pwnImage("heavy-ubuntu22.04"),
  heavyUbuntu2404: () => pwnImage("heavy-ubuntu24.04"),
  revlabUbuntu2204: () => revImage("ubuntu22.04"),
} as const
