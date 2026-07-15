# Spring Boot Source Map

Use when Spring Boot source, JAR/WAR, routes, actuator, filters, interceptors, or config files are present.

## First Safe Checks

1. Run `ctf-java-map` on source/unpacked JAR/WAR.
2. Read `pom.xml`/`build.gradle`, `application.properties/yml`, `Dockerfile`, and profile-specific config.
3. Map controllers and route prefixes from class-level + method-level mappings.
4. Map `Filter`, `OncePerRequestFilter`, `HandlerInterceptor`, `WebMvcConfigurer`, and Spring Security config.
5. Identify data binders: `@RequestParam`, `@PathVariable`, `@RequestBody`, `@ModelAttribute`, `MultipartFile`, headers, cookies, session.

## Route Security Table

| Route | Method | Handler | Inputs | Filter / Interceptor | Auth Rule | Sink |
|---|---|---|---|---|---|---|

## High-Value Spring Surfaces

- Actuator: `/actuator`, `/actuator/env`, `/actuator/heapdump`, `/actuator/mappings`, `/actuator/logfile`.
- H2 console: `/h2-console`, JDBC URL/user/password from config.
- Swagger/OpenAPI: `/swagger-ui`, `/v3/api-docs`, `/api-docs`.
- Error and whitelabel pages exposing stack traces or binding errors.
- Static/resource handlers, custom `addResourceHandlers`, download/view endpoints.
- Profiles and config: `spring.profiles.active`, env overrides, default credentials.

## Source-Guided Workflow

1. Start from sinks and privileged transitions, then walk backward to routes.
2. Confirm route reachability and auth boundary.
3. Confirm controlled fields and validation/transforms.
4. Use one safe probe to validate oracle.
5. Build final minimal request/solver.

## Stop Rules

- Do not fuzz all routes before mapping filters/security.
- Do not assume actuator is exposed; verify endpoint and management base path.
- Do not deep dive CVEs before source-proven reachability or version/config evidence.
