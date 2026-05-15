# Leaflet — Interactive Maps

## CDN

```html
<!-- in <head> -->
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
```

```js
const L = await import('https://unpkg.com/leaflet@1.9.4/dist/leaflet-src.esm.js')
  .then(m => m.default ?? m);
```

## Key API

- Init: `L.map('id').setView([lat, lng], zoom)`
- Tile layer: `L.tileLayer(url, { maxZoom, attribution }).addTo(map)`
- Marker: `L.marker([lat, lng]).addTo(map).bindPopup('...')`
- Fit bounds: `map.fitBounds(L.latLngBounds(latLngs), { padding: [40,40] })`
- Fly to: `map.flyTo([lat, lng], zoom, { duration: 1 })`
- Click: `map.on('click', e => { e.latlng.lat; e.latlng.lng; })`
- Swap tile layer: `map.removeLayer(old); L.tileLayer(...).addTo(map)`

## Tile Sources

| Name | URL template |
|------|-------------|
| OpenStreetMap | `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` |
| OpenTopoMap | `https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png` |
| Esri World Imagery | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` |
