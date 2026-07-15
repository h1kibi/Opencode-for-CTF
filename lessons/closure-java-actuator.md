# closure-java-actuator

## Trigger
- Spring Boot actuator, env/config exposure, heapdump-like signal, or Java privileged read/debug surface is confirmed.

## Why it looks promising
- Actuator/config endpoints often yield credentials, secrets, environment variables, routes, or privileged file paths.

## What usually goes wrong
- The solver keeps generic endpoint exploration instead of closing through config/secret/admin data.

## Better question
- Which actuator/config/debug output most directly reveals credentials, file paths, secrets, or privileged route enablement?

## First corrective probe
- Rank env/config/beans/mappings/heap-related surfaces by closure value, not curiosity.

## Closure queue
1. direct secret/credential extraction
2. file path / source / route enablement extraction
3. privileged route activation or auth bypass path
4. deserialization/template/file-read pivot only if needed
5. one minimal confirmation request

## Stop rule
- Do not keep broad actuator curiosity once a secret-bearing or route-enabling output is visible.
