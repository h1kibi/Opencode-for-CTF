---
name: ctf-forensics-stego
description: Use for steganography / media forensics — LSB, palette, spectrogram, appended data, and encoded message extraction from images, audio, and video.
compatibility: opencode
---

# CTF Forensics — Steganography & Media

## Stop Conditions

Stop before destructive extraction, when provenance would be lost, when the required tool/fallback is unavailable, or when the artifact class is falsified. Do not repeat equivalent extraction attempts without a new discriminator.

## Output Contract

Return confirmed evidence, uncertainty, source artifact/offset, command or tool used, status (`continue`, `pivot`, `blocked`, `dead`, or `close`), and exactly one next action.

## Dispatch / Handoff

Return artifact paths, hashes, offsets/streams, tool output, interpretation, and one next action to `ctf-forensics`; preserve provenance across any child artifact.

## First Safe Action

Hash and preserve the media, record dimensions/codec/metadata, then run the cheapest non-destructive stego probe.

## Required Inputs

Require the original artifact, hash/provenance, acquisition constraints, current forensics phase, and the exact extraction question.

## Do Not Load When

Do not load without the matching artifact class, and do not use this focused skill to replace `ctf-forensics` preservation, provenance, or phase ownership.

## Load When

Load when image, audio, video, palette, spectrogram, appended-data, or LSB evidence suggests steganography or media hiding.

## Trigger

Load when triage identifies image (PNG, JPG, BMP, GIF), audio (WAV, MP3, FLAC), video, or unknown files with appended data or flagged entropy.

## Primary Tools

- `zsteg` — PNG/BMP LSB detection
- `stegsolve` — GUI stego analysis (LSB, palette, frame browser)
- `binwalk` — appended/following data
- `strings -n 6` — embedded text
- `exiftool` — metadata
- `steghide` — JPEG/BMP/WAV known-password extraction
- `outguess` — PPM/JPG extraction
- `jsteg` — JPG stego
- `sonic-visualiser` — audio spectrogram
- `audacity` — audio analysis

## Image Stego Checklist

□ `zsteg <file>` — quick LSB scan
□ `binwalk <file>` — check for embedded/following data
□ `exiftool <file>` — metadata, thumbnail anomalies
□ `strings <file>` — embedded text
□ Check trailing data after IEND (PNG) / FFD9 (JPG)
□ Compare with original (if provided)
□ LSB per color channel (stegsolve)
□ Palette analysis (stegsolve → Analyse → Colour Palette)
□ Alpha channel anomalies
□ Frame analysis for animated PNG/GIF

## Audio Stego Checklist

□ Spectrogram (Audacity: Spectrogram view, Sonic Visualiser: Spectrogram pane)
□ LSB decoding of sample values
□ Phase encoding
□ Echo hiding
□ Reverse playback
□ Speed change (slow down / speed up)
□ Morse code / DTMF detection
□ Compare channels for differences

## Workflow

1. Run `ctf-stego-probe` for automated triage
2. Check appended data and metadata first (quickest wins)
3. Scan LSB for images
4. Check spectrogram for audio
5. If password-protected, try common passwords
6. Extract and verify
