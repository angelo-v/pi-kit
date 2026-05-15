# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0

### Added
- `spa-html` skill — build self-contained single-page web applications as a single HTML file with inline CSS and JS, CDN-only dependencies, modular JS via custom elements, and WebAwesome for standard UI components.
- `cem_list_elements` tool — lists all custom elements from any CEM-compliant `custom-elements.json` URL with compact tag + summary output.
- `cem_search_elements` tool — keyword search across tag names, summaries, and descriptions in a CEM manifest.
- `cem_get_element` tool — fetches full API detail (attributes, properties, events, slots, CSS custom properties, CSS parts) for a single element by tag name.
- `write_adr` tool — creates a new Architecture Decision Record in the workspace, auto-detecting the ADR directory and incrementing the sequence number.
- `adr` skill — guides the agent when creating ADRs, including directory detection and record structure.
