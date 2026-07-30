// UP Brand tokens — mirrors globals.css :root vars
// Import these in components instead of hardcoding hex values

export const UP = {
  black:  '#060810',
  navy:   '#0d1220',
  card:   '#111827',
  border: '#1e2d4a',
  blue:   '#1565ff',
  blue2:  '#0a4fd6',
  sky:    '#4d9fff',
  silver: '#c8d4e8',
  mist:   '#5a7296',
  white:  '#eef2fb',
}

export const HS = {
  black:  '#0a0a0c',
  card:   '#161618',
  border: '#2a2a2e',
  red:    '#c8102e',
  red2:   '#a00d24',
  silver: '#9aa0ae',
  white:  '#f0f0f2',
}

// The 10 apparel colors shared across ALL product previewers
export const APPAREL_COLORS = [
  { name: 'White',         hex: '#ffffff' },
  { name: 'Black',         hex: '#1a1a1a' },
  { name: 'Hot Pink',      hex: '#e91e8c' },
  { name: 'Royal Blue',    hex: '#1565c0' },
  { name: 'Forest Green',  hex: '#2e7d32' },
  { name: 'Purple',        hex: '#6a1b9a' },
  { name: 'Red',           hex: '#c62828' },
  { name: 'Navy',          hex: '#0d1b4b' },
  { name: 'Teal',          hex: '#00695c' },
  { name: 'Gold',          hex: '#f9a825' },
]

// Master list of all apparel items — used by gallery admin item selector
export const APPAREL_ITEMS = [
  // Tops
  { id: 'crew-neck-tee',        label: 'Crew Neck T-Shirt',        group: 'Tops',    component: 'CrewNeckT' },
  { id: 'vneck-tee',            label: 'V-Neck T-Shirt',           group: 'Tops',    component: 'VNeckT' },
  { id: 'crew-neck-ls',         label: 'Crew Neck Long Sleeve',    group: 'Tops',    component: 'CrewNeckLongSleeve' },
  { id: 'hoodie',               label: 'Hoodie',                   group: 'Tops',    component: 'Hoodie' },
  { id: 'crew-neck-sweatshirt', label: 'Crew Neck Sweatshirt',     group: 'Tops',    component: 'CrewNeckSweatshirt' },
  // Tanks
  { id: 'racerback-tank',       label: 'Racerback Tank',           group: 'Tanks',   component: 'RacerbackTank' },
  { id: 'festival-tank',        label: 'Festival Tank',            group: 'Tanks',   component: 'FestivalTank' },
  { id: 'relaxed-jersey-tank',  label: 'Relaxed Fine Jersey Tank', group: 'Tanks',   component: 'RelaxedFineJerseyTank' },
  // Bottoms
  { id: 'joggers',              label: 'Joggers',                  group: 'Bottoms', component: 'Joggers' },
  { id: 'sweatpants',           label: 'Sweatpants',               group: 'Bottoms', component: 'SweatPants' },
  { id: 'mens-shorts',          label: "Men's Shorts",             group: 'Bottoms', component: 'MensShorts' },
  { id: 'womens-shorts',        label: "Women's Shorts",           group: 'Bottoms', component: 'WomensShorts' },
]
