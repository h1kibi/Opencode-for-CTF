# Java template engine not confirmed

family: anti-pattern
category: web/java-web

## Trigger
- SSTI/SpEL payloads are tried because Thymeleaf/Freemarker/JSP appears in dependencies or templates, but controlled engine context is not proven.

## Better question
Does controlled input reach template name resolution, expression parsing, fragment selection, or only escaped model data?

## Stop rule
After two harmless expression markers produce no engine-specific differential, stop template payload variants.

## Control action
Run `ctf-java-source-slice` focused on view/template route, identify engine/context, then use an engine-specific harmless marker or pivot to file/auth/source closure.
