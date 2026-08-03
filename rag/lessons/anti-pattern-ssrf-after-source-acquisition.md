# anti-pattern-ssrf-after-source-acquisition

## Trigger
- SSRF already yielded source, config, internal route names, or enough runtime evidence, but SSRF enumeration continues.

## Why it looks promising
- SSRF surfaces often feel open-ended and powerful.

## Why it is strategically weak now
- The information problem is already solved; more SSRF discovery delays closure.

## Better closure family
- source-guided exploit closure, internal admin route closure, config/credential pivot, or file-read closure.

## Revisit trigger
- Existing closure probes fail and a concrete missing internal dependency remains.
