# Custom Elements — JS Pattern

```js
class MyWidget extends HTMLElement {
  #state = {};

  connectedCallback() {
    this.render();
    this.addEventListener('click', this.#onClick.bind(this));
  }

  disconnectedCallback() { /* clean up timers/listeners */ }

  static get observedAttributes() { return ['value']; }
  attributeChangedCallback(name, _old, val) {
    this.#state[name] = val;
    this.render();
  }

  #onClick(e) { /* handle via e.target.matches('[data-action="x"]') */ }

  render() {
    this.innerHTML = `<!-- template -->`;
  }
}
customElements.define('my-widget', MyWidget);
```

## Guidelines

- Private class fields (`#field`) for internal state
- `this.innerHTML = ...` for simple renders; avoid `shadowRoot` (prevents global CSS from reaching the component)
- Cross-component communication: `dispatchEvent(new CustomEvent('my-event', { bubbles: true, detail: {...} }))`
