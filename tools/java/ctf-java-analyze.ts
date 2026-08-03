import javaAnalyzePack from "./ctf-java-analyze-pack.ts"

export default {
  ...javaAnalyzePack,
  description: `${javaAnalyzePack.description} Stable facade: prefer ctf-java-analyze for Java source/archive/bytecode first-pass analysis; ctf-java-analyze-pack remains available for compatibility.`,
}
