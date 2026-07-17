---
name: ctf-forensics-disk
description: Use for disk image / volume / file system forensics — partition analysis, recovery, registry, and hidden data extraction.
---

# CTF Forensics — Disk & File System

## Trigger

Load this sub-skill when triage identifies: `.dd`, `.e01`, `.vmdk`, `.vhd`, `.qcow2`, `.iso`, or raw disk images, or when MBR/GPT/ext4/NTFS/FAT structures are found.

## Primary Tools

- `mmls` — partition table layout
- `fls` / `icat` — file system navigation and file extraction
- `sleuthkit` (`tsk_recover`, `fsstat`, `srch_strings`)
- `strings -e l` — wide string extraction (Windows registry)
- `reglookup` — Windows registry hive analysis
- `photorec` / `testdisk` — file carving

## Workflow

1. Identify image type and partition scheme
2. List partitions and select target
3. Navigate file system, look for hidden/deleted files
4. Check unallocated space for file remnants
5. Extract registry hives (Windows) or key config files (Linux)
6. Search for flag strings across the image
