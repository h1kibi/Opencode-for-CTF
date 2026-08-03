import webReconPack from "./ctf-web-recon-pack.ts"

export default {
  ...webReconPack,
  description: `${webReconPack.description} Stable facade: prefer ctf-web-analyze for the first Web URL analysis; ctf-web-recon-pack remains available for compatibility.`,
}
