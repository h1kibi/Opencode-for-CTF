# Stego & Media Reference

Use this reference for image/audio/video steganography or appended-data analysis after triage confirms a media artifact.

## Trigger

- image/audio/video files
- entropy anomalies
- appended data clues
- spectrogram or frame-based hints

## Primary Route

1. Check appended data and metadata first.
2. Run fast LSB / palette / strings triage.
3. Only then move to frame, alpha, spectrogram, or passworded extractors.
4. Verify extracted payloads before opening a new stego family.

## Preferred Tools

- `ctf-stego-probe`
- `zsteg`
- `stegsolve`
- `binwalk`
- `exiftool`
- `audacity`
- `sonic-visualiser`

## Pivot Rules

- If the extracted payload is itself an archive or executable, pivot to the matching family.
- If the media hides a reversible encoding chain rather than stego, pivot to misc/crypto.
- If repeated extractor guesses require unknown passwords, stop and request stronger evidence.
