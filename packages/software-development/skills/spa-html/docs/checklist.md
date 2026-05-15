# Dos, Don'ts & Accessibility

## Dos and Don'ts

| ✅ Do | ❌ Don't |
|-------|---------|
| Load Pollen first; define semantic vars on top | Skip Pollen and hard-code raw colour/spacing values |
| Use `--color-brand`, `--space-4`, `--radius` in component CSS | Use `--color-indigo-600` or `16px` directly in components |
| Use `wa-*` for buttons, dialogs, inputs, tabs, badges, alerts, icons | Hand-roll UI controls WebAwesome already provides |
| Import JS via `https://esm.sh/pkg@version` | Use jsDelivr or unpkg for JS modules |
| Keep one `<style>`, one `<script type="module">` | Add multiple script/style blocks |
| Update `:root` semantic vars when re-theming | Scatter colour changes across many selectors |
| Pin CDN URLs to a version | Use `@latest` |

## Accessibility Checklist

- [ ] `lang` attribute set on `<html>`
- [ ] All interactive elements keyboard-accessible (`wa-*` handles this)
- [ ] Images have `alt` attributes
- [ ] Form inputs use `label` (`wa-input label="..."` handles this)
- [ ] Colour contrast passes WCAG AA (Pollen's `--color-*-600` on white generally does)
