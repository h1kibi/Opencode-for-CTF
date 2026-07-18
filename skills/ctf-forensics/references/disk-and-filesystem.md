# Disk & File System Reference

Use this reference for disk image / file system forensics after triage confirms a disk or volume artifact.

## Trigger

- `.dd`, `.e01`, `.vmdk`, `.vhd`, `.qcow2`, `.iso`
- MBR/GPT/ext4/NTFS/FAT structures
- deleted-file / hidden-partition / registry-hive clues

## Primary Route

1. Identify image and partition scheme.
2. Enumerate partitions and file systems.
3. Recover visible, deleted, and unallocated artifacts.
4. Extract registry/config/history evidence.
5. Verify any reconstructed flag path from scratch.

## Preferred Tools

- `mmls`
- `fls` / `icat`
- `sleuthkit`
- `photorec` / `testdisk`
- `strings -e l`
- `reglookup`

## Pivot Rules

- If the evidence is mostly executable logic, pivot to rev.
- If the evidence is mostly encoded secrets or transcripts, pivot to crypto/misc.
- If the disk image mainly contains network captures, pivot to network forensics.
