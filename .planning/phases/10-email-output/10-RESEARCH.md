# Phase 10: Email Output - Research

**Researched:** 2026-03-13
**Domain:** MJML compilation, GrapesJS-MJML integration, email HTML generation
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OPS-04 | MJML output valid across all editor block combinations | The MJML plugin exposes `mjml-code-to-html` command that compiles MJML and returns `{html, errors}` — the planner must add a compile step and validate via the errors array |
| OPS-05 | Image URLs in email output are absolute, not relative | Asset upload already produces absolute URLs (BASE_URL + path), but the worker must verify no relative `src` values slip through before calling SES |
</phase_requirements>

---

## Summary

The GrapesJS editor in this codebase uses the `grapesjs-mjml` plugin (v1.0.7) backed by `mjml-browser` (v4.18.0). When the editor stores content, `editor.getHtml()` returns **MJML XML markup** — not compiled email HTML. The `content_html` column in both `templates` and `campaigns` tables therefore stores raw MJML source, not the final email HTML that SES should receive.

The bulk-send worker takes `content_html` and sends it directly to SES without any MJML compilation step. This means email clients receive MJML XML, which they cannot render. OPS-04 requires that the content passed to SES is valid, rendered HTML — the fix is to add a server-side MJML compilation step in the worker (using `mjml` npm package), and to validate the output by checking the `errors` array returned by `mjml()`.

For OPS-05 (absolute URLs): the asset upload service constructs absolute URLs (`${BASE_URL}/assets/${storedFilename}`), so images inserted from the asset manager arrive in the editor with absolute `src` values. The risk is templates that contain relative image paths entered manually or imported from external HTML. The worker must scan the compiled HTML and reject or warn on any relative `src`/`href` values before sending.

**Primary recommendation:** Install `mjml` npm package in the workers package, add a `compileMjml(source: string)` utility that calls `mjml(source, {validationLevel: 'strict'})` and throws on errors, then pipe `content_html` through this utility in the bulk-send worker before applying merge tags and tracking injection. Separately, add a post-compile URL absoluteness guard.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| mjml | ^4.15 | Server-side MJML-to-HTML compiler | Official MJML compiler; `mjml-browser` is browser-only and not suitable for Node workers |
| mjml-browser | 4.18.0 (already installed) | Browser-side compiler (used by grapesjs-mjml) | Already present — do NOT use this in workers |

### Already Present
| Library | Version | Purpose | Note |
|---------|---------|---------|------|
| grapesjs-mjml | 1.0.7 | GrapesJS MJML plugin (browser) | Stores MJML in DB |
| mjml-browser | 4.18.0 | Browser MJML compiler | Bundled by grapesjs-mjml |

**Installation (workers package):**
```bash
npm install mjml --workspace=packages/workers
npm install --save-dev @types/mjml --workspace=packages/workers
```

---

## Architecture Patterns

### The Data Flow Problem

Current (broken) flow:
```
GrapesJS editor
  └─ editor.getHtml()          → returns MJML XML (e.g. <mjml><mj-body>...)
  └─ stored as content_html    → MJML source in DB
  └─ bulk-send worker reads    → sends MJML XML to SES
  └─ email client receives     → MJML XML (unrenderable)
```

Correct flow (after fix):
```
GrapesJS editor
  └─ editor.commands.run('mjml-code-to-html')  → {html, errors}
  └─ stored as content_html    → compiled email HTML in DB
  └─ bulk-send worker reads    → sends compiled HTML to SES
  └─ email client receives     → valid email HTML
```

**Two approaches for where compilation happens:**

**Option A — Compile on save (frontend, at template save time):**
- The `GrapesEditor.getHtml()` method calls `editor.commands.run('mjml-code-to-html')` instead of `editor.getHtml()`
- Compiled HTML is stored in `content_html`; MJML source stored in `content_json`
- Worker receives already-compiled HTML — no worker changes needed for OPS-04
- Con: if compilation fails, save fails (which is actually desirable for OPS-04)

**Option B — Compile on send (worker, at bulk-send time):**
- Worker detects MJML source (starts with `<mjml>`) and compiles via `mjml` npm package
- Con: requires adding `mjml` dependency to workers; compilation errors surface at send time, not save time
- Pro: no frontend change required

**Recommendation: Option A (compile on save)** — errors are caught before any email is sent, compilation failures are immediately visible to the user in the editor UI, and the worker stays simple. The `content_html` column holds ready-to-send HTML, consistent with how existing templates in `seed-templates.ts` work (they store plain HTML directly).

### Pattern 1: Compile on Save in GrapesEditor

**What:** Replace `editor.getHtml() + getCss()` with `editor.commands.run('mjml-code-to-html')` which returns `{html, errors}` from mjml-browser.

**When to use:** Every time the editor saves or the parent reads compiled HTML.

**Example:**
```typescript
// In GrapesEditor.tsx — replace the getHtml imperative handle
useImperativeHandle(ref, () => ({
  getHtml: () => {
    if (!editorRef.current) return '';
    // 'mjml-code-to-html' compiles MJML → HTML via mjml-browser
    const result = editorRef.current.runCommand('mjml-code-to-html') as {
      html: string;
      errors: Array<{ formattedMessage: string }>;
    };
    if (result.errors && result.errors.length > 0) {
      // Log warnings; non-fatal for save, fatal for send
      console.warn('MJML compile warnings:', result.errors.map(e => e.formattedMessage));
    }
    return result.html ?? '';
  },
  getMjml: () => {
    if (!editorRef.current) return '';
    // 'mjml-code' returns raw MJML source for storage in content_json
    return editorRef.current.runCommand('mjml-code') as string;
  },
  getJson: () => {
    if (!editorRef.current) return '{}';
    return JSON.stringify(editorRef.current.getProjectData());
  },
}));
```

### Pattern 2: URL Absoluteness Guard (Worker)

**What:** After MJML compilation (or after receiving `content_html`), scan for relative `src` and `href` attributes and throw if any are found.

**When to use:** In bulk-send worker, after loading `html` from campaign/variant, before merge-tag processing.

**Example:**
```typescript
// In packages/workers/src/email-output.ts (new utility)
export function assertAbsoluteUrls(html: string, context: string): void {
  // Match src="..." and href="..." that are NOT http/https/mailto/tel/cid
  const relativePattern = /(?:src|href)="(?!https?:|mailto:|tel:|cid:|#)([^"]+)"/gi;
  const matches = [...html.matchAll(relativePattern)];
  if (matches.length > 0) {
    const examples = matches.slice(0, 3).map(m => m[1]);
    throw new Error(
      `OPS-05: Relative URLs found in email HTML (${context}): ${examples.join(', ')}`
    );
  }
}
```

### Pattern 3: MJML Source Detection Guard (Worker Defensive Layer)

Even after Option A is implemented, the worker should detect MJML source as a defensive guard for any legacy records.

```typescript
// Detect MJML source vs compiled HTML
export function isMjmlSource(html: string): boolean {
  return html.trimStart().startsWith('<mjml>') || html.trimStart().startsWith('<mjml ');
}
```

### Recommended Project Structure

The new utilities should live in the workers package:

```
packages/workers/src/
├── email-output.ts      # NEW: compileMjml, assertAbsoluteUrls, isMjmlSource
├── bulk-send.worker.ts  # Add assertAbsoluteUrls call after HTML is loaded
├── merge-tags.ts        # Unchanged
└── tracking.ts          # Unchanged
```

### Anti-Patterns to Avoid

- **Calling `editor.getHtml()` directly in MJML context:** Returns MJML source, not email HTML. Always use `runCommand('mjml-code-to-html')` for email-ready HTML.
- **Using `mjml-browser` in Node workers:** It is browser-targeted and may not work correctly in Node.js. Use the `mjml` npm package instead.
- **Stripping CSS from the compiled output:** MJML compiles with inline styles — do not pass through `editor.getCss()` concatenation, which adds a `<style>` block that is irrelevant and potentially invalid in the MJML output.
- **Blocking sends on MJML warnings:** MJML distinguishes errors (invalid output) from warnings (minor issues). Block only on `errors`, not `warnings`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MJML compilation | Custom regex/parser for MJML | `mjml` npm package | MJML spec is complex; handrolled parsers miss media queries, responsive behavior, and fallback tables |
| URL absoluteness check | Complex URL parser | Simple regex against `src=` / `href=` not starting with `https?:` | The only case that matters is catching relative paths before SES delivery |
| MJML error detection | Parse HTML output | `result.errors` array from `mjml()` | Official compiler surfaces all structural issues |

---

## Common Pitfalls

### Pitfall 1: `editor.getHtml()` Returns MJML, Not Email HTML
**What goes wrong:** Calling `editor.getHtml()` in a grapesjs-mjml editor returns the MJML source XML, not compiled email HTML. SES delivers MJML markup to inboxes.
**Why it happens:** The plugin overrides GrapesJS component model to represent MJML components. `getHtml()` serializes those components back to MJML XML. The compiled HTML is only available via `runCommand('mjml-code-to-html')`.
**How to avoid:** Always use `runCommand('mjml-code-to-html')` to get email-ready HTML from a MJML-enabled editor.
**Warning signs:** `content_html` in DB starts with `<mjml>` or `<mj-body>`.

### Pitfall 2: `mjml-browser` vs `mjml` (Node)
**What goes wrong:** Using `mjml-browser` in the workers package fails silently or throws due to browser-only dependencies (`window`, `document`).
**Why it happens:** `mjml-browser` bundles JSDOM mocks. It works in browser/Next.js but is not intended for raw Node.js environments.
**How to avoid:** Install the `mjml` npm package in the workers package. The API is identical: `import mjml from 'mjml'; const {html, errors} = mjml(source);`
**Warning signs:** Worker throws `window is not defined` or `document is not defined` at startup.

### Pitfall 3: MJML `validationLevel` Setting
**What goes wrong:** Using `validationLevel: 'strict'` throws on unknown attributes, breaking custom component use. Using `validationLevel: 'skip'` silently produces bad output.
**Why it happens:** MJML has three levels: `strict` (throw on any issue), `soft` (warn, continue), `skip` (ignore).
**How to avoid:** Use `validationLevel: 'soft'` for compilation. Check `errors` array — if any `tagName` is `mjml` (root error), treat as fatal. Log warnings but don't block.
**Warning signs:** Sends failing with MJML validation errors on valid templates.

### Pitfall 4: Merge Tags Inside MJML Before Compilation
**What goes wrong:** Processing merge tags (e.g., `{{first_name}}`) before MJML compilation can produce malformed MJML if the merge tag value contains characters that break XML (e.g., `<`, `>`, `&`).
**Why it happens:** MJML is XML-based. Unescaped characters in attribute values or text content invalidate the MJML document.
**How to avoid:** Compile MJML first, then apply merge tags to the compiled HTML output. This is already the correct order in the worker pipeline (compile → merge-tags → tracking).
**Warning signs:** MJML compilation errors when contact names contain `&` or `<`.

### Pitfall 5: Relative Image Paths from External Template Imports
**What goes wrong:** A template imported via the MJML import dialog (or pasted HTML) may contain relative image paths like `src="/images/logo.png"`. These work in browser preview but break in email clients.
**Why it happens:** The `mj-image` component's `src` attribute is not validated for absoluteness by MJML.
**How to avoid:** The URL guard in the worker catches these. Also validate at save time in the API if possible.
**Warning signs:** Images broken in sent emails; relative paths in `content_html` DB column.

---

## Code Examples

### Running `mjml-code-to-html` in GrapesEditor

```typescript
// Source: grapesjs-mjml v1.0.7 dist/index.js (internal command 'mjml-code-to-html')
// The command runs mjmlParser(mjmlSource) and returns { html, errors }
const result = editor.runCommand('mjml-code-to-html') as {
  html: string;
  errors: Array<{ formattedMessage: string; severity: number }>;
};
// severity 1 = warning, severity 2 = error
const hasErrors = result.errors.some(e => e.severity === 2);
```

### Server-side MJML Compilation (workers package)

```typescript
// Source: mjml npm package v4.x official API
import mjml2html from 'mjml';

export function compileMjml(source: string): string {
  const result = mjml2html(source, {
    validationLevel: 'soft',
    minify: false,
  });

  // Filter for actual errors (not warnings)
  const errors = result.errors.filter(e => !e.isWarning);
  if (errors.length > 0) {
    throw new Error(
      `MJML compilation failed: ${errors.map(e => e.formattedMessage).join('; ')}`
    );
  }

  return result.html;
}
```

### Absolute URL Guard

```typescript
// Validates no relative src or href values remain in compiled HTML
export function assertAbsoluteUrls(html: string, campaignId: number): void {
  const pattern = /(?:src|href)="(?!https?:|mailto:|tel:|cid:|#|$)([^"]{1,200})"/gi;
  const matches = [...html.matchAll(pattern)];
  if (matches.length > 0) {
    const samples = matches.slice(0, 3).map(m => m[1]).join(', ');
    throw new Error(
      `OPS-05: Campaign ${campaignId} contains relative URLs in email HTML: ${samples}`
    );
  }
}
```

### Worker Integration Point

```typescript
// In bulk-send.worker.ts — add after loading html, before processMergeTags
// Detect legacy MJML source records (defensive)
if (html.trimStart().startsWith('<mjml')) {
  // Should not happen after OPS-04 fix — log as error and skip
  console.error('OPS-04: Received uncompiled MJML source in bulk-send worker', { campaignId, messageId });
  return { skipped: true, reason: 'uncompiled_mjml' };
}

// OPS-05: Validate absolute URLs before processing
assertAbsoluteUrls(html, campaignId);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `editor.getHtml()` for email HTML | `runCommand('mjml-code-to-html')` | grapesjs-mjml v1.x | getHtml() returns MJML source, not HTML |
| Inline styles via MJML | MJML compiled HTML (already inline) | MJML v4 | Don't add separate `<style>` blocks to MJML output |

**Deprecated/outdated:**
- `editor.getCss()` concatenation: Not applicable to MJML-compiled output. MJML inlines all styles. The current `getHtml() + getCss()` pattern is wrong for MJML templates.

---

## Open Questions

1. **Are existing `content_html` values in DB MJML source or compiled HTML?**
   - What we know: `seed-templates.ts` stores raw HTML (not MJML) — those templates are fine. Templates created via the GrapesJS editor store MJML source.
   - What's unclear: Production DB state — how many campaigns/templates have MJML-source content_html.
   - Recommendation: The fix should handle both cases. After the OPS-04 fix, new saves produce compiled HTML. Existing records with MJML source should either be re-compiled at save, or detected+blocked at send time (via the defensive guard).

2. **Should content_json store MJML source or GrapesJS project data?**
   - What we know: Currently `getProjectData()` stores GrapesJS internal JSON. The MJML source is reconstructed from this via `mjml-code` command.
   - What's unclear: Whether content_json round-trips reliably.
   - Recommendation: Keep `content_json` as GrapesJS project data (for editor reload). Store compiled HTML in `content_html`. The editor can always recompile from project data.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (packages/api/vitest.config.ts) |
| Config file | `packages/api/vitest.config.ts` |
| Quick run command | `npm test --workspace=packages/api -- --run` |
| Full suite command | `npm test --workspace=packages/api -- --run --coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OPS-04 | MJML compiled output has no errors across all block types | unit | `npm test --workspace=packages/api -- --run tests/mjml-output.unit.test.ts` | ❌ Wave 0 |
| OPS-04 | Compiled HTML is valid HTML (contains `<html>`, `<body>`, no `<mjml>`) | unit | same | ❌ Wave 0 |
| OPS-05 | Absolute URL guard throws on relative src/href | unit | `npm test --workspace=packages/api -- --run tests/absolute-urls.unit.test.ts` | ❌ Wave 0 |
| OPS-05 | Absolute URL guard passes on absolute src/href | unit | same | ❌ Wave 0 |
| OPS-05 | Asset upload URL is absolute (integration pattern check) | unit | same | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test --workspace=packages/api -- --run`
- **Per wave merge:** `npm test --workspace=packages/api -- --run --coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/tests/mjml-output.unit.test.ts` — covers OPS-04 (MJML compile validity across block types)
- [ ] `packages/api/tests/absolute-urls.unit.test.ts` — covers OPS-05 (URL absoluteness guard)

**Note on test placement:** The vitest alias `@twmail/workers` → `packages/workers/src` is already configured in `vitest.config.ts`. Tests for `email-output.ts` utilities in workers can import from `@twmail/workers/email-output` and run under the API test suite.

---

## Sources

### Primary (HIGH confidence)
- `packages/frontend/src/components/editor/grapes-editor.tsx` — verified `editor.getHtml()` usage and what it returns
- `node_modules/grapesjs-mjml/dist/index.js` — verified `mjml-code-to-html` command name and `{html, errors}` return shape
- `node_modules/grapesjs-mjml/README.md` — component list, plugin options
- `packages/workers/src/workers/bulk-send.worker.ts` — confirmed worker receives `content_html` directly with no MJML compile step
- `packages/api/src/services/assets.service.ts` — confirmed asset URLs are constructed as absolute `${BASE_URL}/assets/${filename}`
- `packages/workers/src/tracking.ts` — confirmed BASE_URL usage for tracking URLs (absolute)
- `packages/workers/package.json` — confirmed `mjml` is NOT currently in workers dependencies

### Secondary (MEDIUM confidence)
- mjml-browser v4.18.0 package.json (installed) — version confirmed

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — directly inspected installed packages and source code
- Architecture: HIGH — traced full data flow from editor.getHtml() through worker to SES
- Pitfalls: HIGH — identified by reading minified grapesjs-mjml bundle and worker code

**Research date:** 2026-03-13
**Valid until:** 2026-06-13 (grapesjs-mjml API is stable; mjml v4 API is long-stable)
