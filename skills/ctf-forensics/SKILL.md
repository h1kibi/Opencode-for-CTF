---
name: ctf-forensics
description: Use for authorized forensics CTF challenges involving disk images, memory dumps, pcaps, archives, documents, steganography, metadata, logs, malware artifacts, or evidence extraction.
compatibility: opencode
---

# CTF Forensics Orchestrator

Core rule: **Preserve originals, triage before deep extraction.** Start with file type inventory and strings before running heavy tools.

## Purpose

This skill is the forensics challenge controller. It enforces the forensics solve state machine: `preserve → triage → classify → extract → reconstruct → verify`.

## Scope

Use only on provided challenge artifacts or explicitly authorized evidence.

## Phase Workflow

```
preserve → triage → classify → extract → reconstruct → verify → retro
```

### Phase: Preserve

- Copy the original artifact; work only on copies
- Record SHA-256 hash, file size, modification timestamp
- Create `extracted/` directory for derived files
- Do NOT modify the original — forensics integrity matters

### Phase: Triage

Run these in parallel (dispatch as concurrent sub-agents if team mode):

| Tool / Check | What It Reveals |
|-------------|-----------------|
| `file` | Actual type (not extension) |
| `strings -n 6` | Embedded text, URLs, IPs, flags |
| `binwalk` | Embedded files, signatures |
| `exiftool` | EXIF, metadata, thumbnails |
| `xxd` / hexdump | Header/footer inspection |
| `foremost` | File carving candidates |
| `trID` | File type identification |

Record: file type(s), embedded file count, suspicious strings, metadata anomalies.

### Phase: Classify

Route to sub-discipline based on triage results:

| Evidence | Sub-Discipline | Primary Tools |
|----------|---------------|--------------|
| Disk image (.dd, .e01, .vmdk, .vhd, .qcow2) | Disk Forensics | `mmls`, `fls`, `icat`, `sleuthkit`, `autopsy` |
| Memory dump (.mem, .raw, .vmem) | Memory Forensics | `volatility`, `vol3`, `bulk_extractor` |
| PCAP / PCAPNG | Network Forensics | `tshark`, `wireshark`, `tcpdump`, `strings` |
| Image (PNG, JPG, BMP, GIF) | Image/Stego Analysis | `zsteg`, `stegsolve`, `binwalk`, `python PIL` |
| Audio (WAV, MP3, FLAC) | Audio Forensics | `sonic-visualiser`, `audacity`, `spectrogram` |
| Document (PDF, DOCX, XLSX, ODT) | Document Forensics | `oleid`, `olevba`, `pdf-parser`, `zipfile` |
| Binary blob / firmware | Binary Analysis | `binwalk`, `strings`, `hexdump`, `firmware-mod-kit` |
| Archive (ZIP, RAR, 7z, tar) | Archive Analysis | `unzip`, `rar`, `7z`, `binwalk` |
| Unknown / mixed | Generic | file → binwalk → strings → foremost |

### Phase: Extract

For each sub-discipline, follow the specific extraction flow:

#### Disk Forensics
```text
mmls <image>           → partition layout
fls -r <image>         → full file listing
icat <image> <inode>   → extract specific file
blkls <image>          → unallocated space
sigfind <sig> <image>  → search for file signatures
```
- Recover deleted files
- Extract registry hives for Windows images
- Check for hidden partitions, unallocated space

#### Memory Forensics
```text
volatility -f <dump> imageinfo             → profile identification
volatility -f <dump> --profile=<p> pslist  → process list
volatility -f <dump> --profile=<p> cmdline → command line history
volatility -f <dump> --profile=<p> netscan → network connections
volatility -f <dump> --profile=<p> clipboard → clipboard contents
volatility -f <dump> --profile=<p> filescan → open file handles
volatility -f <dump> --profile=<p> mimikatz → credential extraction
volatility -f <dump> --profile=<p> dumpfiles → dump process memory
```
- Volatility 3 uses `vol -f <dump> <plugin>` syntax
- Check for injected code (`malfind`, `hollowfind`)
- Extract encryption keys, clipboard data, command histories

#### Network Forensics
```text
tshark -r <pcap> -Y "http" -T fields -e http.host -e http.request.uri
tshark -r <pcap> -Y "dns" -T fields -e dns.qry.name
tshark -r <pcap> -Y "tcp.flags.syn==1 and tcp.flags.ack==0" -T fields -e tcp.srcport
tcpdump -r <pcap> -X          → hex+ASCII packet content
tcpdump -r <pcap> -A          → ASCII packet content
```
- Extract transferred files: `tshark -r <pcap> --export-objects http,<dir>`
- Follow TCP streams
- Check for DNS tunneling, covert channels
- Decrypt TLS if keylog file is available

#### Image / Stego Analysis
```
Checklist:
□ File type and appended data (binwalk / strings after image end)
□ EXIF metadata (exiftool)
□ LSB in each color channel (zsteg / stegsolve)
□ Palette manipulation (stegsolve)
□ Alpha channel manipulation
□ Thumbnail differs from main image
□ Multiple images compared (subtract / XOR)
□ QR / barcode scanning
□ Color table anomalies
```

#### Document Forensics
```
• OLE objects and macros (oleid, olevba)
• Hidden text / whitespace stego
• XML relationships in OOXML (unzip → inspect)
• Embedded images, fonts, objects
• PDF: streams, objects, JS actions
• Version history / tracked changes
• Metadata fields (author, creation date, software)
```

#### Audio Forensics
```
• Spectrogram analysis (audacity, sonic-visualiser)
• LSB / phase encoding
• Echo / tone / DTMF decoding
• Slow down / speed up for hidden messages
• Reverse audio for backmasking
• Morse code detection
```

### Phase: Reconstruct

- Combine extracted pieces into the complete flag or evidence
- Document the reconstruction logic
- Verify each piece has a clear source

### Phase: Verify

- Test the reconstruction: can you reproduce the flag from scratch?
- The solve script should be deterministic
- Write `solve.py` that automates the extraction

### Phase: Retro

- What techniques worked? What was a dead end?
- Update tool discipline if needed
- Record technique → flag mapping for future reference

---

## Input Collection Checklist

Before starting, inventory:

- [ ] Original artifact path(s) and hash(es)
- [ ] Challenge description and hints
- [ ] Flag format
- [ ] Is the artifact single or multi-file?
- [ ] Any passwords, keys, or hints provided?
- [ ] Any known tool requirements?

## Output Contract

```
notes.md:
  - case summary
  - file inventory with hashes
  - triage findings
  - extraction log with commands and results
  - reconstructed flag path
  - final flag

solve.py:
  deterministic extraction + flag output + agent_flag.txt
```

## Evidence Requirements

Every finding requires:
1. Artifact path and offset/address
2. Tool command and output
3. Interpretation (why this matters)
4. Reproducibility (same command produces same result)

## Stop Conditions

Stop or ask when:
- Required tool is missing and no fallback exists
- Extraction would destroy the original artifact
- Artifact is password-protected and password is unknown
- All likely extraction paths exhausted without result
- Artifact appears intentionally corrupted beyond recovery

## Sub-Discipline Dispatch

| Surface | Load |
|---------|------|
| Disk image / volume / file system | `ctf-forensics-disk` |
| Memory / RAM dump / hibernation file | `ctf-forensics-memory` |
| PCAP / network capture | `ctf-forensics-network` |
| Stego / media / image / audio | `ctf-forensics-stego` |
| Document / OLE / OOXML / PDF | `ctf-forensics-doc` |
| Binary / blob / firmware | `ctf-forensics-binary` |
| Archive / compressed / encrypted | `ctf-safe-extract` tool |
