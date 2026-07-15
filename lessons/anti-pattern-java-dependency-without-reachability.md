# Java dependency without reachability

family: anti-pattern
category: web/java-web

## Trigger
- Fastjson/Shiro/Log4j/Jackson/Struts/SnakeYAML appears only in dependencies.
- No route, parser call, config gate, controlled data shape, or oracle is proven.

## Better question
Which request reaches this dependency-controlled parser/sink, with what controlled bytes and what oracle?

## Stop rule
Do not run gadget/CVE payloads. Cap confidence at 2-3 until route + config + controlled data shape + oracle are proven.

## Control action
DEMOTE the dependency-only branch and run `ctf-java-source-slice`, `ctf-java-dep-risk`, or Java pattern-card search with evidence terms.
