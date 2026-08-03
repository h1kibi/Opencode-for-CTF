# owner-web-java-handoff

## Trigger
- The challenge is reached via HTTP, but stack traces, source, bytecode, actuator, templates, or framework behavior show the real sink is Java/Spring-owned.

## Why it looks promising
- Web is the visible transport surface, so it feels natural to keep Web as the owner.

## What usually goes wrong
- The solve keeps treating Java evidence as supporting detail while the actual parser, sink, config, or closure blocker is Java-native.

## Better question
- Does HTTP still own the problem, or is HTTP now only delivery for a Java-controlled sink or closure path?

## First corrective probe
- Write an Owner Matrix and compare: which surface best explains the sink, oracle, and endgame path?

## Handoff trigger
- Java explains template execution, actuator data, deserialization, file-read path, config loading, bytecode validation, or closure blocker better than Web.

## Return trigger
- Return to Web only if the remaining problem becomes authz/workflow/browser/runtime transport again.

## Closure owner
- The surface that owns the primitive-to-flag completion, not the one that first exposed the route.
