# Java boot failure needs local harness

family: failure
category: web/java-web

## Trigger
- Spring/Tomcat app will not boot due to environment, DB, profile, JDK, or missing service; progress stalls.

## Better question
Can the target controller/service/mapper/parser method be isolated with mocks to prove source-to-sink and oracle?

## Stop rule
Do not spend more than a short setup budget fixing full app boot before writing a harness plan for the top sink.

## Control action
Use `ctf-local-harness-verifier` as plan/evidence, mock request/session/DTO/mapper/filesystem/HTTP client/security context, and confirm sink arguments locally.
