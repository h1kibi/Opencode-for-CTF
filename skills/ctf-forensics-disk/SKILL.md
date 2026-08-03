---
name: ctf-forensics-disk
description: Use for disk image / volume / file system forensics — partition analysis, recovery, registry, and hidden data extraction.
compatibility: opencode
---

# CTF Forensics — Disk & File System

## Stop Conditions

Stop before destructive extraction, when provenance would be lost, when the required tool/fallback is unavailable, or when the artifact class is falsified. Do not repeat equivalent extraction attempts without a new discriminator.

## Output Contract

Return confirmed evidence, uncertainty, source artifact/offset, command or tool used, status (`continue`, `pivot`, `blocked`, `dead`, or `close`), and exactly one next action.

## Dispatch / Handoff

Return artifact paths, hashes, offsets/streams, tool output, interpretation, and one next action to `ctf-forensics`; preserve provenance across any child artifact.

## First Safe Action

Hash and preserve the original image, identify its container and partition layout, then operate on a read-only view.

## Required Inputs

Require the original artifact, hash/provenance, acquisition constraints, current forensics phase, and the exact extraction question.

## Do Not Load When

Do not load without the matching artifact class, and do not use this focused skill to replace `ctf-forensics` preservation, provenance, or phase ownership.

## Load When

Load when triage identifies a disk image, volume, partition table, filesystem, registry hive, or deleted-file recovery path.

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
