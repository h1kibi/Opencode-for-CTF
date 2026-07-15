# Java Template / Expression Injection

Use for Thymeleaf, Freemarker, Velocity, JSP EL, SpEL, OGNL, Struts tags, or expression-like sinks.

## Triggers

- Dependencies: `thymeleaf`, `freemarker`, `velocity`, `struts`, `spring-expression`.
- Source uses `TemplateEngine`, `FreeMarker`, `VelocityEngine`, `SPEL`, `ExpressionParser`, `eval`, `Ognl`.
- User-controlled template name, view name, fragment, template content, or expression field.
- JSP/EL contexts: `${...}`, `#{...}`, taglibs, JSTL, scriptlets.

## First Safe Checks

1. Identify the parser/engine before payloads.
2. Determine controlled surface: template name, template body, model attribute, view resolver, expression string, or JSP parameter.
3. Confirm evaluation with harmless arithmetic/string marker appropriate to that engine.
4. Check sandbox/security manager/filtering and output context.
5. If RCE is blocked, look for file read, bean access, environment/config leak, or classpath/resource read.

## Engine Matrix

| Engine | Source Clue | Controlled Input | Safe Eval Check | Interesting Primitive |
|---|---|---|---|---|
| Thymeleaf | `TemplateEngine`, view names, fragments | view/template/fragment/expression | arithmetic/string expression | bean/env/file/class access depending context |
| Freemarker | `.ftl`, `Configuration`, `process` | template body/model | interpolation marker | object wrapper/class access/file read |
| Velocity | `.vm`, `VelocityEngine` | template body/context | interpolation marker | reflection/toolbox access |
| JSP EL | `.jsp`, `${}` | params/model/session | EL arithmetic/string | bean/session/config leak |
| SpEL | `ExpressionParser`, `@Value`, `#{}` | expression string | arithmetic/string | type access/method call if allowed |
| OGNL/Struts | Struts deps/tags/actions | params/action fields | benign expression | action/context access |

## Stop Rules

- Do not reuse payloads across engines without proving parser identity.
- Do not treat template path control as expression control; test path traversal/view resolution separately.
- After two failed expression payloads without an engine-specific error/oracle, pivot to source reachability and context mapping.

## Spring/Thymeleaf Specialization

When Thymeleaf or SpEL is confirmed, also load `java-spel-filecopyutils.md`. Prefer file-read via Spring/JDK utilities over command execution in distroless containers or WAF-blocked contexts.
