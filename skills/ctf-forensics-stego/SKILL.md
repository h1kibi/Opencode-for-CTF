---
name: ctf-forensics-stego
description: Use for steganography / media forensics — LSB, palette, spectrogram, appended data, and encoded message extraction from images, audio, and video.
---

# CTF Forensics — Steganography & Media

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
