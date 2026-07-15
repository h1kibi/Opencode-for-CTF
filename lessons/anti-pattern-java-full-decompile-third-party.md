# Java full decompile third-party waste

family: anti-pattern
category: web/java-web

## Trigger
- Agent starts full decompilation of BOOT-INF/lib or Maven dependencies before app routes/sinks are mapped.

## Better question
Which app-owned controller/service/mapper/parser/security class is closest to a route, sink, or flag path?

## Stop rule
Do not full-decompile third-party libraries before app class map, config map, and selected bytecode hints exist.

## Control action
PIVOT to `ctf-java-archive-map`, safe extraction, `ctf-java-map`, `ctf-java-bytecode-hints`, then selected `ctf-java-decompile-targets` for app classes only.
