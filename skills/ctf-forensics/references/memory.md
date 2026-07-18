# Memory Reference

Use this reference for RAM / hibernation / pagefile / VM snapshot challenges after triage confirms a memory artifact.

## Trigger

- `.mem`, `.raw`, `.vmem`, `.dmp`, `hiberfil.sys`, `pagefile.sys`
- process, credential, clipboard, or injected-code clues

## Primary Route

1. Identify profile/runtime.
2. Enumerate suspicious processes and command lines.
3. Check network, injected code, and user activity artifacts.
4. Dump only high-value process or file regions.
5. Verify any recovered flag or secret with provenance.

## Preferred Tools

- `volatility 2`
- `volatility 3`
- `bulk_extractor`

## Pivot Rules

- If the dump mainly contains application logic, pivot to rev.
- If the relevant artifact is a decrypted file or browser output, pivot to the matching disk/document/media lane.
- If the only remaining path is destructive credential dumping outside challenge scope, stop.
