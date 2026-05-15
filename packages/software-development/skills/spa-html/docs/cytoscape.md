# Cytoscape.js — Graph Visualisation

## CDN

```js
import cytoscape from 'https://esm.sh/cytoscape@3';
```

## Key API

- Init: `cytoscape({ container, elements, style, layout })`
- Elements: nodes (`data.id`, `data.label`, `data.group`) and edges (`data.id`, `data.source`, `data.target`, `data.label`)
- Styles: CSS-like selectors — `'node'`, `'edge'`, `'node:selected'`, `'node[group="x"]'`
- Resolve CSS vars at init: `getComputedStyle(document.documentElement).getPropertyValue(name)`
- Events: `cy.on('select', 'node, edge', cb)` / `cy.on('unselect', ...)`
- Re-run layout: `cy.layout({ name: '...', animate: true }).run()`
- Built-in layouts: `cose`, `breadthfirst`, `circle`, `grid`, `concentric`, `random`
- Export PNG: `cy.png({ output: 'blob', bg: '#...', scale: 2 })`
