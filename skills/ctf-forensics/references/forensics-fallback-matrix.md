# Forensics Fallback Matrix

Use this when a forensics branch stalls. Pick exactly one fallback that improves preservation, extraction, or reconstruction quality.

| Failed Stage | Symptom | Fallback | Stop / Pivot Rule |
|---|---|---|---|
| Preserve | Original artifact at risk | Re-copy original, hash it, and work only on derived copies or extracted outputs | Do not continue on the original artifact |
| Triage | File type or surface unclear | Re-run file / strings / exif / binwalk / xxd and classify the dominant artifact surface | If the artifact is clearly code/math/service shaped, route to rev/crypto/web/misc |
| Surface Selection | Mixed artifact or multiple surfaces | Pick one primary surface: disk, memory, network, stego/media, document/blob, archive | Do not open multiple deep branches without evidence ownership |
| Dedicated Probe | Specialized helper yields little | Fall back to manual raw tools for that surface: tshark/strings/binwalk/oletools/volatility/sleuthkit | Keep exact commands and derived paths in notes |
| Extraction | Carve/dump path noisy | Narrow by offsets, stream IDs, inode paths, or process IDs before another broad dump | Stop broad carving loops if they only create low-signal duplicates |
| Reconstruction | Pieces found but no final flag | Reconstruct one chain at a time with explicit source path for every piece | Do not merge ambiguous fragments without provenance |
| Verification | Candidate output not accepted | Re-check offsets, decompression, decoding, newline/wrapper format, and whether the final artifact is complete | Do not claim flags from partial or unverifiable evidence |

High-information fallbacks:

- Preservation discipline beats faster extraction.
- Dedicated probes first, raw tools second.
- Offsets, paths, stream IDs, and process IDs beat blind dumping.
- Reconstruction with provenance beats pattern guessing.
