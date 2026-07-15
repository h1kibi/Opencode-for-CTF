# Java Auth / Filter / Interceptor Bypass

Use when Java Web challenges contain login/session logic, servlet filters, Spring Security, Shiro, interceptors, path matching, or role checks.

## Triggers

- `Filter`, `OncePerRequestFilter`, `HandlerInterceptor`, `WebMvcConfigurer`, `Spring Security`, `ShiroFilterFactoryBean`.
- `JSESSIONID`, rememberMe, role/admin checks, session attributes, custom auth annotations.
- Route-specific allow/deny patterns, static resource exclusions, path prefix checks.
- Proxy/path normalization hints, servlet path/context path confusion, encoded slash/semicolon behavior.

## First Safe Checks

1. Map every auth boundary before payloads: filters, interceptors, security config, annotations, and controller checks.
2. Build a route/auth table with anonymous/user/admin expectations.
3. Identify path matcher type: Ant matcher, MVC matcher, servlet mapping, regex, Shiro chain, or custom string prefix.
4. Test one safe differential at a time: trailing slash, double slash, semicolon matrix param, encoded slash, case, context path, method change.
5. If two accounts exist, use authz matrix for object ownership/role boundary.

## Auth Boundary Table

| Route Pattern | Matcher / Filter | Required Role | Exclusions | Controller Check | Session Key | Candidate Bypass |
|---|---|---|---|---|---|---|

## Common Java Bypass Families

- Spring Security matcher mismatch: `antMatchers` vs MVC path handling.
- Servlet path confusion: context path, path info, encoded slash, semicolon content.
- Static/resource exclusions accidentally covering dynamic paths.
- Interceptor excludes prefix/suffix too broadly.
- Shiro chain order: first matching path wins.
- Method mismatch: GET allowed, POST protected or vice versa.
- Session attribute trust: user-controlled role/id or missing server-side lookup.

## Stop Rules

- Do not spray path normalization variants before identifying matcher/filter source or a live differential.
- After two path variants with no auth/status/body differential, pivot to source mapping.
- Do not mutate admin state until a read-only auth bypass or role confusion is proven.
