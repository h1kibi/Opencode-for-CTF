# glibc Version Route Map

## Purpose

This card promotes glibc version to a first-layer routing signal. Use it before naming heap / FILE / hook routes.

## Version Buckets

### glibc 2.23–2.27
- common anchor: Ubuntu 16.04–18.04 era
- hooks usually still usable: `__free_hook`, `__malloc_hook`
- no safe-linking
- fake stdout / fake FILE routes often practical
- `setcontext+53` and hook-assisted ORW/data-only closure can be strong

### glibc 2.28–2.31
- transition era; verify exact allocator behavior
- hooks still exist
- safe-linking not yet the default pressure everywhere
- unsorted / tcache / overlap routes still often classic
- still check bundled libc before trusting generic Ubuntu 20.04 assumptions

### glibc 2.32–2.33
- safe-linking likely
- hooks still present but heap routes must account for safe-linking
- leak classification becomes mandatory before tcache poisoning
- fake stdout / FILE routes may still work, but version-specific offsets matter more

### glibc 2.34–2.35
- `__free_hook` / `__malloc_hook` are removed or no longer default route targets
- do not route to hooks first
- prefer data-only, FILE, setcontext, ORW, direct read/write, or output-hijack closure
- safe-linking pressure remains

### glibc 2.36+
- modern glibc pressure is high
- assume safe-linking and stronger FILE/FSOP constraints
- closure should prefer shortest modern route: direct read, ORW, setcontext-oriented chain, data-only hijack
- generic old-house writeups are lower priority unless source/runtime proves applicability

## First Safe Check

1. Use `ctf-pwn-libc-resolver` for symbol offsets and feature hints.
2. Use `ctf-pwn-libc-fingerprint` for BuildID / hash / tuple comparison.
3. Map the version bucket before choosing heap/FILE/hook closure.

## Route Pressure

- hooks available + write primitive -> only then consider hook routes
- safe-linking present -> require heap leak / key strategy before tcache poisoning
- fake stdout / fake FILE -> promote earlier on 2.23–2.27 when evidence matches
- `setcontext+53` -> promote when hooks are weak/removed and a context-write route exists

## Stop Rule

If glibc version is unknown and the branch depends on heap technique naming, stop and resolve version/runtime first.
