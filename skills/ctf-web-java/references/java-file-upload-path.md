# Java File / Upload / Path Traversal

Use for file read/write/download/view/upload/archive extraction/static resource/JSP write candidates.

## Triggers

- `File`, `FileInputStream`, `FileOutputStream`, `Files.read*`, `Files.write*`, `Paths.get`, `Resource`, `ClassPathResource`.
- `MultipartFile`, upload controllers, archive extraction, image/document processing.
- Filename/path/template/view/resource parameters.
- Tomcat/JSP/static directory deployment clues.

## First Safe Checks

1. Identify base directory, normalization, extension checks, and storage path.
2. Determine whether path is read, write, delete, list, include, or served statically.
3. For traversal, test harmless known files or source/config files before flag paths.
4. For uploads, upload a benign canary and verify location, extension, content-type, and served/reload behavior.
5. For archive extraction, check zip slip/path traversal safely with listing or canary plan before writes.

## File Primitive Table

| Route | Operation | Base Dir | Controlled Part | Normalization | Extension / MIME Check | Oracle |
|---|---|---|---|---|---|---|

## Java-Specific Notes

- `Paths.get(base, user)` can still traverse if normalized/checked incorrectly.
- `ResourceUtils`, `ClassPathResource`, and `ServletContext.getResource` may expose classpath/webroot resources.
- JSP execution requires write into served/reloadable JSP path; many upload dirs are static-only.
- Tomcat unpacked WAR paths differ from classpath resources; verify real served path.
- Windows path separators and URL decoding order may matter.

## Stop Rules

- Do not overwrite existing files; use canary names.
- Do not assume upload equals code execution; verify served/reload behavior.
- After two traversal encodings without differential, inspect normalization/source rather than spraying encodings.
