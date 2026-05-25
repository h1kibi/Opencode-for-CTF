# Language-Specific Web CTF Patterns

## Pattern: PHP wrapper-driven LFI

Signals:
- PHP source or PHP server.
- File parameter, include-like behavior, download/view/template route.
- Errors mention stream wrapper or include path.

Expected primitive:
- Local file read or source disclosure.

First safe check:
- Read a harmless known local file or source file when challenge scope allows.

Attack queue effect:
- Value: 4
- Cost: 2
- Risk: 1
- Stability: 4
- Confidence: +1 when source confirms include/read sink.

Stop rule:
- Stop after two wrapper/path variants if no differential behavior appears.

## Pattern: Java Spring Thymeleaf/SpEL expression path

Signals:
- Spring Boot, Thymeleaf, template expression, view-name control, or stack trace.
- `pom.xml` contains Thymeleaf or Spring expression dependencies.

Expected primitive:
- Template expression evaluation or file read/RCE depending on sink.

First safe check:
- Run `ctf-java-map`; confirm route-to-template sink before probing.

Attack queue effect:
- Value: 5 if source-backed, 3 if black-box only.
- Cost: 2 source-backed, 4 black-box.
- Risk: 2 for arithmetic probe, higher for write/RCE.

Stop rule:
- Do not continue payload variants if template engine is not confirmed.
