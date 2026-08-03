# Java auth filter before payload

family: failure
category: web/java-web

## Trigger
- Payload depth starts against a route without mapping Spring Security/Shiro/Servlet filter/interceptor decisions.

## Better question
Which identity/session/path/method reaches the handler and which filter or interceptor blocks it?

## Stop rule
If 401/403/302 dominates, stop payload mutation and build a route-auth table.

## Control action
Use `ctf-java-map`, `ctf-web-authz-matrix`, `ctf-web-state-machine-map`, or one path/method normalization differential before exploit payload depth.
