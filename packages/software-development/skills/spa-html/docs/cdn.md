# CDN Reference

## Pollen (CSS tokens — always load first)

```html
<link rel="stylesheet" href="https://esm.sh/pollen-css@5/pollen.css" />
```

## WebAwesome (loaded separately — not via esm.sh)

```html
<link rel="stylesheet" href="https://ka-f.webawesome.com/webawesome@3.7.0/styles/themes/default.css" />
<link rel="stylesheet" href="https://ka-f.webawesome.com/webawesome@3.7.0/styles/native.css" />
<script type="module" src="https://ka-f.webawesome.com/webawesome@3.7.0/webawesome.loader.js"></script>
```

Check latest version:
```bash
curl -s https://data.jsdelivr.com/v1/package/npm/@awesome.me/webawesome | grep -A1 '"latest"'
```

## JS packages (esm.sh — default for all JS imports)

```js
import { marked }    from 'https://esm.sh/marked@12';
import DOMPurify     from 'https://esm.sh/dompurify@3';
import Fuse          from 'https://esm.sh/fuse.js@7';
import { z }         from 'https://esm.sh/zod@3';
import { format }    from 'https://esm.sh/date-fns@3';
import { v4 as uid } from 'https://esm.sh/uuid@9';
import { Chart }     from 'https://esm.sh/chart.js@4';
import confetti      from 'https://esm.sh/canvas-confetti@1';
```

Pin to a major version (`@12`) for stability; pin exact (`@12.3.0`) for reproducibility.
