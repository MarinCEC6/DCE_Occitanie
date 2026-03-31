const OCCITANIE_BOUNDS = [[-0.45, 42.25], [4.95, 45.05]];
const POINTS_URL = './data/blocks_points.geojson';
const LARGE_URL = './data/blocks_large.geojson';
const DEPARTMENTS_URL = './data/occitanie_departments.geojson';
const SUMMARY_URL = './data/summary.json';

const SIZE_LABELS = {
  '0_5': '0-5 ha',
  '5_10': '5-10 ha',
  '10_15': '10-15 ha',
  '15_plus': '15+ ha',
};

const CROP_LABELS = {
  grandes_cultures: 'Grandes cultures',
  perennes: 'Perennes',
  prairie_elevage: 'Prairie / elevage',
  mixte: 'Mixte',
  autre: 'Autre',
};

const HYDRIC_LABELS = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const CROP_COLORS = {
  grandes_cultures: '#b88b2f',
  perennes: '#cb6c56',
  prairie_elevage: '#6f9c68',
  mixte: '#6d778f',
  autre: '#aa9e8a',
};

const HYDRIC_COLORS = {
  low: '#d9e1c6',
  medium: '#ecb96b',
  high: '#d95c4f',
};

const SIZE_COLORS = {
  '0_5': '#ded4c7',
  '5_10': '#d8b071',
  '10_15': '#b27a4d',
  '15_plus': '#8d5f44',
};

const dom = {
  departmentSelect: document.getElementById('departmentSelect'),
  colorModeSelect: document.getElementById('colorModeSelect'),
  toggleLargePolygons: document.getElementById('toggleLargePolygons'),
  toggleNearOnly: document.getElementById('toggleNearOnly'),
  clearFiltersBtn: document.getElementById('clearFiltersBtn'),
  fitOccitanieBtn: document.getElementById('fitOccitanieBtn'),
  setRespondentBtn: document.getElementById('setRespondentBtn'),
  clearRespondentBtn: document.getElementById('clearRespondentBtn'),
  blockCard: document.getElementById('blockCard'),
  legend: document.getElementById('legend'),
  statTotalBlocks: document.getElementById('statTotalBlocks'),
  statFilteredBlocks: document.getElementById('statFilteredBlocks'),
  statMedianHa: document.getElementById('statMedianHa'),
  statHydricHigh: document.getElementById('statHydricHigh'),
  statNearBlocks: document.getElementById('statNearBlocks'),
  statNearHigh: document.getElementById('statNearHigh'),
};

const state = {
  map: null,
  pointsData: null,
  largeData: null,
  departmentsData: null,
  filteredPointFeatures: [],
  filteredLargeFeatures: [],
  respondentMode: false,
  respondentPoint: null,
  selectedBlockId: null,
  pointsById: new Map(),
};

function fmtInt(value) {
  return Number(value || 0).toLocaleString('fr-FR');
}

function fmtDec(value, digits = 1) {
  return Number(value || 0).toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function loadJson(url) {
  return fetch(url).then((response) => {
    if (!response.ok) throw new Error(`Failed to load ${url}`);
    return response.json();
  });
}

function getCheckedValues(name) {
  return [...document.querySelectorAll(`input[type="checkbox"][value][value][name="${name}"]`)]
    .filter((input) => input.checked)
    .map((input) => input.value);
}

function hydrateCheckboxNames() {
  document.querySelectorAll('.check-group').forEach((group, index) => {
    const name = `check-group-${index}`;
    group.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.name = name;
    });
  });
}

function populateDepartments() {
  const names = new Map();
  for (const feature of state.departmentsData.features) {
    names.set(feature.properties.department_code, feature.properties.department_name);
  }
  [...names.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([code, label]) => {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = `${code} - ${label}`;
      dom.departmentSelect.appendChild(option);
    });
}

function currentFilters() {
  const sizeValues = [...document.querySelectorAll('#sizeGroup input[type="checkbox"]')].filter((x) => x.checked).map((x) => x.value);
  const cropValues = [...document.querySelectorAll('#cropGroup input[type="checkbox"]')].filter((x) => x.checked).map((x) => x.value);
  const hydricValues = [...document.querySelectorAll('#hydricGroup input[type="checkbox"]')].filter((x) => x.checked).map((x) => x.value);
  return {
    department: dom.departmentSelect.value,
    sizes: new Set(sizeValues),
    crops: new Set(cropValues),
    hydric: new Set(hydricValues),
    nearOnly: dom.toggleNearOnly.checked,
    showLarge: dom.toggleLargePolygons.checked,
    colorMode: dom.colorModeSelect.value,
  };
}

function haversineKm(lon1, lat1, lon2, lat2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function featureDistanceKm(feature) {
  if (!state.respondentPoint) return null;
  const [lon, lat] = feature.geometry.coordinates;
  return haversineKm(state.respondentPoint.lng, state.respondentPoint.lat, lon, lat);
}

function matchesFilter(feature, filters) {
  const props = feature.properties;
  if (filters.department !== 'all' && props.dep !== filters.department) return false;
  if (!filters.sizes.has(props.size)) return false;
  if (!filters.crops.has(props.crop)) return false;
  if (!filters.hydric.has(props.hydric_cls)) return false;
  if (filters.nearOnly) {
    const distance = featureDistanceKm(feature);
    if (distance === null || distance > 10) return false;
  }
  return true;
}

function filterFeatures() {
  const filters = currentFilters();
  state.filteredPointFeatures = state.pointsData.features.filter((feature) => matchesFilter(feature, filters));
  const allowedIds = new Set(state.filteredPointFeatures.map((feature) => feature.properties.id));
  state.filteredLargeFeatures = filters.showLarge
    ? state.largeData.features.filter((feature) => allowedIds.has(feature.properties.id))
    : [];
}

function colorExpression(mode) {
  const lookup = mode === 'hydric' ? HYDRIC_COLORS : mode === 'size' ? SIZE_COLORS : CROP_COLORS;
  const field = mode === 'hydric' ? 'hydric_cls' : mode === 'size' ? 'size' : 'crop';
  const expression = ['match', ['get', field]];
  Object.entries(lookup).forEach(([key, value]) => {
    expression.push(key, value);
  });
  expression.push('#7f7f7f');
  return expression;
}

function updateLegend() {
  const mode = currentFilters().colorMode;
  const lookup = mode === 'hydric' ? HYDRIC_COLORS : mode === 'size' ? SIZE_COLORS : CROP_COLORS;
  const labels = mode === 'hydric' ? HYDRIC_LABELS : mode === 'size' ? SIZE_LABELS : CROP_LABELS;
  dom.legend.innerHTML = '';
  Object.keys(lookup).forEach((key) => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<span class="legend-swatch" style="background:${lookup[key]}"></span><span>${labels[key]}</span>`;
    dom.legend.appendChild(item);
  });
}

function updateSources() {
  const pointCollection = { type: 'FeatureCollection', features: state.filteredPointFeatures };
  const largeCollection = { type: 'FeatureCollection', features: state.filteredLargeFeatures };
  state.map.getSource('blocks-points').setData(pointCollection);
  state.map.getSource('blocks-large').setData(largeCollection);
  state.map.setPaintProperty('blocks-circles', 'circle-color', colorExpression(currentFilters().colorMode));
  state.map.setPaintProperty('blocks-large-fill', 'fill-color', colorExpression(currentFilters().colorMode));
  state.map.setPaintProperty('blocks-large-line', 'line-color', colorExpression(currentFilters().colorMode));
}

function updateStats() {
  dom.statTotalBlocks.textContent = fmtInt(state.pointsData.features.length);
  dom.statFilteredBlocks.textContent = fmtInt(state.filteredPointFeatures.length);
  const areas = state.filteredPointFeatures.map((feature) => feature.properties.ha).filter((value) => Number.isFinite(value));
  const sorted = [...areas].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  dom.statMedianHa.textContent = median === null ? '-' : `${fmtDec(median, 1)} ha`;
  const hydricHigh = state.filteredPointFeatures.filter((feature) => feature.properties.hydric_cls === 'high').length;
  dom.statHydricHigh.textContent = state.filteredPointFeatures.length ? `${fmtDec((100 * hydricHigh) / state.filteredPointFeatures.length, 1)}%` : '-';

  if (state.respondentPoint) {
    const near = state.filteredPointFeatures.filter((feature) => featureDistanceKm(feature) <= 10);
    const nearHigh = near.filter((feature) => feature.properties.hydric_cls === 'high').length;
    dom.statNearBlocks.textContent = fmtInt(near.length);
    dom.statNearHigh.textContent = near.length ? `${fmtDec((100 * nearHigh) / near.length, 1)}%` : '0%';
  } else {
    dom.statNearBlocks.textContent = '-';
    dom.statNearHigh.textContent = '-';
  }
}

function updateRespondentLayers() {
  const pointSource = state.map.getSource('respondent-point');
  const circleSource = state.map.getSource('respondent-circle');
  if (!state.respondentPoint) {
    pointSource.setData({ type: 'FeatureCollection', features: [] });
    circleSource.setData({ type: 'FeatureCollection', features: [] });
    return;
  }
  pointSource.setData({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [state.respondentPoint.lng, state.respondentPoint.lat] }, properties: {} }],
  });
  circleSource.setData(makeCircleGeoJSON(state.respondentPoint.lng, state.respondentPoint.lat, 10));
}

function makeCircleGeoJSON(lng, lat, radiusKm) {
  const coords = [];
  for (let i = 0; i <= 64; i += 1) {
    const bearing = (i / 64) * 2 * Math.PI;
    const dx = (radiusKm / 111.32) * Math.cos(bearing);
    const dy = (radiusKm / 111.32) * Math.sin(bearing);
    coords.push([lng + dx / Math.cos((lat * Math.PI) / 180), lat + dy]);
  }
  return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} }] };
}

function setBlockCard(feature) {
  if (!feature) {
    dom.blockCard.className = 'block-card empty';
    dom.blockCard.textContent = 'Clique un bloc pour afficher sa fiche.';
    return;
  }
  const props = feature.properties;
  dom.blockCard.className = 'block-card';
  dom.blockCard.innerHTML = `
    <h3>Bloc ${props.id}</h3>
    <dl>
      <dt>Departement</dt><dd>${props.dep}</dd>
      <dt>Surface eligible</dt><dd>${fmtDec(props.ha, 2)} ha</dd>
      <dt>Classe de taille</dt><dd>${SIZE_LABELS[props.size] || props.size}</dd>
      <dt>Culture dominante</dt><dd>${CROP_LABELS[props.crop] || props.crop}</dd>
      <dt>Culture detail</dt><dd>${props.label || 'n.d.'}</dd>
      <dt>Part dominante</dt><dd>${fmtDec((props.share || 0) * 100, 1)}%</dd>
      <dt>Hydric</dt><dd>${HYDRIC_LABELS[props.hydric_cls] || props.hydric_cls} (${fmtDec(props.hydric, 1)})</dd>
      <dt>Distance reseau</dt><dd>${fmtDec(props.grid, 2)} km</dd>
    </dl>
  `;
}

function popupHtml(feature) {
  const props = feature.properties;
  return `
    <div class="popup-title">Bloc ${props.id}</div>
    <div class="popup-line">${CROP_LABELS[props.crop] || props.crop} · ${SIZE_LABELS[props.size] || props.size}</div>
    <div class="popup-line">${fmtDec(props.ha, 1)} ha · hydric ${HYDRIC_LABELS[props.hydric_cls] || props.hydric_cls}</div>
  `;
}

function selectFeature(feature, lngLat) {
  state.selectedBlockId = feature.properties.id;
  setBlockCard(feature);
  new maplibregl.Popup({ closeButton: false, offset: 12 })
    .setLngLat(lngLat)
    .setHTML(popupHtml(feature))
    .addTo(state.map);
}

function refresh() {
  filterFeatures();
  updateSources();
  updateStats();
  updateLegend();
}

function resetFilters() {
  dom.departmentSelect.value = 'all';
  document.querySelectorAll('.check-group input[type="checkbox"]').forEach((input) => { input.checked = true; });
  dom.toggleLargePolygons.checked = true;
  dom.toggleNearOnly.checked = false;
  dom.colorModeSelect.value = 'crop';
  refresh();
}

async function init() {
  hydrateCheckboxNames();
  const [pointsData, largeData, departmentsData, summary] = await Promise.all([
    loadJson(POINTS_URL),
    loadJson(LARGE_URL),
    loadJson(DEPARTMENTS_URL),
    loadJson(SUMMARY_URL),
  ]);

  state.pointsData = pointsData;
  state.largeData = largeData;
  state.departmentsData = departmentsData;
  pointsData.features.forEach((feature) => state.pointsById.set(feature.properties.id, feature));

  state.map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors',
        },
      },
      layers: [
        { id: 'osm', type: 'raster', source: 'osm' },
      ],
    },
    center: [1.7, 43.7],
    zoom: 6.1,
    maxZoom: 15,
    cooperativeGestures: true,
  });

  state.map.addControl(new maplibregl.NavigationControl(), 'top-right');

  state.map.on('load', () => {
    state.map.addSource('departments', { type: 'geojson', data: departmentsData });
    state.map.addSource('blocks-points', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    state.map.addSource('blocks-large', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    state.map.addSource('respondent-point', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    state.map.addSource('respondent-circle', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

    state.map.addLayer({
      id: 'department-fill',
      type: 'fill',
      source: 'departments',
      paint: { 'fill-color': '#f8f2e7', 'fill-opacity': 0.25 },
    });
    state.map.addLayer({
      id: 'department-line',
      type: 'line',
      source: 'departments',
      paint: { 'line-color': '#7a6757', 'line-width': 1.2, 'line-opacity': 0.7 },
    });
    state.map.addLayer({
      id: 'respondent-circle-fill',
      type: 'fill',
      source: 'respondent-circle',
      paint: { 'fill-color': '#bf6d3a', 'fill-opacity': 0.14 },
    });
    state.map.addLayer({
      id: 'respondent-circle-line',
      type: 'line',
      source: 'respondent-circle',
      paint: { 'line-color': '#bf6d3a', 'line-width': 3, 'line-opacity': 0.95, 'line-dasharray': [2, 2] },
    });
    state.map.addLayer({
      id: 'blocks-large-fill',
      type: 'fill',
      source: 'blocks-large',
      paint: { 'fill-color': colorExpression('crop'), 'fill-opacity': 0.18 },
    });
    state.map.addLayer({
      id: 'blocks-large-line',
      type: 'line',
      source: 'blocks-large',
      paint: { 'line-color': colorExpression('crop'), 'line-width': 0.8, 'line-opacity': 0.42 },
    });
    state.map.addLayer({
      id: 'blocks-hit',
      type: 'circle',
      source: 'blocks-points',
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          5, ['match', ['get', 'size'], '0_5', 6.0, '5_10', 6.6, '10_15', 7.2, 7.8],
          9, ['match', ['get', 'size'], '0_5', 9.0, '5_10', 9.8, '10_15', 10.8, 11.8],
          12, ['match', ['get', 'size'], '0_5', 12.0, '5_10', 13.0, '10_15', 14.0, 15.0]
        ],
        'circle-opacity': 0.01,
        'circle-stroke-opacity': 0.0,
      },
    });
    state.map.addLayer({
      id: 'blocks-circles',
      type: 'circle',
      source: 'blocks-points',
      paint: {
        'circle-color': colorExpression('crop'),
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          5, ['match', ['get', 'size'], '0_5', 2.2, '5_10', 2.6, '10_15', 3.0, 3.4],
          9, ['match', ['get', 'size'], '0_5', 3.6, '5_10', 4.2, '10_15', 4.9, 5.8],
          12, ['match', ['get', 'size'], '0_5', 5.4, '5_10', 6.2, '10_15', 7.1, 8.2]
        ],
        'circle-opacity': 0.72,
        'circle-stroke-color': '#f9f4ea',
        'circle-stroke-width': 0.45,
      },
    });
    state.map.addLayer({
      id: 'respondent-point-layer',
      type: 'circle',
      source: 'respondent-point',
      paint: {
        'circle-radius': 6,
        'circle-color': '#bf6d3a',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    });

    state.map.on('click', 'blocks-hit', (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      selectFeature(feature, event.lngLat);
    });
    state.map.on('click', 'blocks-large-fill', (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const pointFeature = state.pointsById.get(feature.properties.id);
      selectFeature(pointFeature || feature, event.lngLat);
    });
    state.map.on('mouseenter', 'blocks-hit', () => { state.map.getCanvas().style.cursor = 'pointer'; });
    state.map.on('mouseleave', 'blocks-hit', () => { state.map.getCanvas().style.cursor = ''; });

    state.map.on('click', (event) => {
      if (!state.respondentMode) return;
      state.respondentMode = false;
      dom.setRespondentBtn.textContent = 'Poser un point';
      state.respondentPoint = { lng: event.lngLat.lng, lat: event.lngLat.lat };
      updateRespondentLayers();
      refresh();
    });

    populateDepartments();
    dom.statTotalBlocks.textContent = fmtInt(summary.n_blocks_total);
    refresh();
    state.map.fitBounds(OCCITANIE_BOUNDS, { padding: 30, duration: 0 });
  });

  dom.departmentSelect.addEventListener('change', refresh);
  dom.colorModeSelect.addEventListener('change', refresh);
  dom.toggleLargePolygons.addEventListener('change', refresh);
  dom.toggleNearOnly.addEventListener('change', refresh);
  document.querySelectorAll('.check-group input[type="checkbox"]').forEach((input) => input.addEventListener('change', refresh));
  dom.clearFiltersBtn.addEventListener('click', resetFilters);
  dom.fitOccitanieBtn.addEventListener('click', () => state.map.fitBounds(OCCITANIE_BOUNDS, { padding: 30 }));
  dom.setRespondentBtn.addEventListener('click', () => {
    state.respondentMode = !state.respondentMode;
    dom.setRespondentBtn.textContent = state.respondentMode ? 'Clique sur la carte' : 'Poser un point';
  });
  dom.clearRespondentBtn.addEventListener('click', () => {
    state.respondentPoint = null;
    state.respondentMode = false;
    dom.setRespondentBtn.textContent = 'Poser un point';
    updateRespondentLayers();
    refresh();
  });
}

init().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<pre style="padding:24px;color:#7a1f1f">${error.message}</pre>`;
});
