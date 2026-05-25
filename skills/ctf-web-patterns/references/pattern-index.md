# CTF Web Pattern Index

Use this index after recon and attack-queue.

| Signal | Reference | Pattern Family | First Safe Check |
|---|---|---|---|
| SQL error, filtered keywords, odd ORDER BY behavior | server-side-patterns.md | SQLi filter/parser bypass | one boolean/error probe only |
| Upload accepts transformed files, image/PDF/Office parsing | server-side-patterns.md | parser/upload/polyglot | metadata inspection before upload loop |
| URL fetch, webhook, image import, PDF render | server-side-patterns.md / parser-proxy-patterns.md | SSRF/parser discrepancy | one localhost/internal-safe probe |
| XML/SVG/DOCX/XLSX/SOAP/SAML | server-side-patterns.md | XXE/XML injection | parser identification first |
| Template syntax reflected or stack trace mentions template engine | server-side-patterns.md / language-patterns.md | SSTI/expression injection | arithmetic probe only |
| JWT/JWK/KID/JKU/token | auth-patterns.md | JWT/key confusion/header injection | decode and inspect header/claims first |
| OAuth/OIDC/SAML/CORS | auth-patterns.md | identity flow/trust boundary | map flow before mutation |
| admin bot/headless/browser-only behavior | client-side-patterns.md | XSS/CSP/DOM/XS-Leak | runtime identification first |
| Host/X-Forwarded/cache/proxy headers | parser-proxy-patterns.md | proxy/cache/Host header | one header-diff probe |
| PHP-specific syntax/source | language-patterns.md | PHP wrappers/type juggling/deser | source/sink map first |
| Java/Spring/Tomcat/Shiro/MyBatis/JSP | language-patterns.md | Java web patterns | run ctf-java-map first |
| Node/Express/Next/EJS/Pug | language-patterns.md | prototype/Node template/sandbox | package.json/source map first |
| version banner or named product | cve-shaped-patterns.md | CVE-shaped playbook | verify version and reachability first |
