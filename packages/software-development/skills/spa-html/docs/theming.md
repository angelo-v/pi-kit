# Theming System

Every app follows a two-layer CSS variable pattern.

---

## Layer 1 — Pollen tokens (load first, never modify)

```html
<link rel="stylesheet" href="https://esm.sh/pollen-css@5/pollen.css" />
```

Injects ~150 design tokens into `:root`:

| Category | Variables | Example |
|---|---|---|
| Typography scale | `--scale-0` … `--scale-10`, fluid variants | `font-size: var(--scale-3)` |
| Font stacks | `--font-sans`, `--font-serif`, `--font-mono` | |
| Font weight | `--weight-regular` … `--weight-black` | |
| Line height | `--line-xs` … `--line-xl` | |
| Letter spacing | `--letter-xs` … `--letter-xl` | |
| Prose width | `--prose-xs` … `--prose-xl` | |
| Spacing | `--size-1` (4 px) … `--size-96` (384 px), `--size-px` | `gap: var(--size-4)` |
| Max widths | `--width-xs` … `--width-xl` | |
| Colour palette | `--color-{name}-{50–950}`, e.g. `--color-indigo-600` | |
| Named shortcuts | `--color-grey`, `--color-blue`, `--color-red` … | |
| Border radius | `--radius-xs` (3 px) … `--radius-xl` (16 px), `--radius-full` | |
| Shadows | `--shadow-xs` … `--shadow-xl` | |
| Blur | `--blur-xs` … `--blur-xl` | |
| Easing | `--ease-in-cubic`, `--ease-out-back`, etc. | |
| Z-index layers | `--layer-1` … `--layer-5`, `--layer-top`, `--layer-below` | |
| Grid helpers | `--grid-2` … `--grid-12`, `--grid-page` | |

---

## Layer 2 — Semantic theme (defined in `<style>`, inside `:root`)

Map Pollen primitives to app-level semantic names. **All component CSS uses only semantic vars** — never raw Pollen tokens directly, except inside this theme block.

```css
:root {
  /* === Colour theme === */
  --color-bg:          var(--color-grey-50);
  --color-surface:     var(--color-white);
  --color-border:      var(--color-grey-200);
  --color-text:        var(--color-grey-900);
  --color-text-muted:  var(--color-grey-500);

  /* Brand — change these two lines to re-theme the whole app */
  --color-brand:       var(--color-indigo-600);
  --color-brand-light: var(--color-indigo-50);
  --color-brand-dark:  var(--color-indigo-800);

  /* Semantic states */
  --color-danger:      var(--color-red-600);
  --color-success:     var(--color-green-600);
  --color-warning:     var(--color-amber-500);

  /* === Typography === */
  --font-body:   var(--font-sans);
  --text-sm:     var(--scale-00);   /* 0.875 rem */
  --text-base:   var(--scale-0);    /* 1 rem */
  --text-lg:     var(--scale-1);    /* 1.125 rem */
  --text-xl:     var(--scale-2);    /* 1.25 rem */
  --text-2xl:    var(--scale-3);    /* 1.5 rem */
  --text-3xl:    var(--scale-4);    /* 1.875 rem */

  /* === Spacing === */
  --space-1:  var(--size-1);    /*  4 px */
  --space-2:  var(--size-2);    /*  8 px */
  --space-3:  var(--size-3);    /* 12 px */
  --space-4:  var(--size-4);    /* 16 px */
  --space-6:  var(--size-6);    /* 24 px */
  --space-8:  var(--size-8);    /* 32 px */
  --space-12: var(--size-12);   /* 48 px */

  /* === Surface styling === */
  --radius:      var(--radius-md);   /* 8 px  */
  --radius-lg:   var(--radius-lg);   /* 12 px */
  --shadow:      var(--shadow-xs);
  --shadow-card: var(--shadow-sm);

  /* === Layout === */
  --max-w:    var(--width-xl);       /* 1280 px */
  --z-nav:    var(--layer-3);
  --z-dialog: var(--layer-4);

  /* === Transitions === */
  --ease:       var(--ease-out-cubic);
  --duration:   150ms;
}
```

### Dark mode (optional)

```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg:         var(--color-grey-950);
    --color-surface:    var(--color-grey-900);
    --color-border:     var(--color-grey-700);
    --color-text:       var(--color-grey-50);
    --color-text-muted: var(--color-grey-400);
  }
}
```

### Re-theming

To change the brand colour, only two lines need changing in `:root`:

```css
--color-brand:       var(--color-violet-600);
--color-brand-light: var(--color-violet-50);
--color-brand-dark:  var(--color-violet-800);
```
