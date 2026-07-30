/**
 * up-previewers.js — Under Pressure Color Previewer Widget
 *
 * Drop this script into any HTML page, then add a div like:
 *   <div data-up-previewer="hoodie"></div>
 *   <div data-up-previewer="crew-neck-tee"></div>
 *   ... etc
 *
 * The widget will mount the correct React color previewer into each div.
 *
 * Supported product IDs:
 *   crew-neck-tee, vneck-tee, crew-neck-ls, hoodie, crew-neck-sweatshirt,
 *   racerback-tank, festival-tank, relaxed-jersey-tank,
 *   joggers, sweatpants, mens-shorts, womens-shorts
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import ColorPreviewer from './ColorPreviewer'

// ── Product images ────────────────────────────────────────────────
import crewNeckTFront    from './assets/crew-neck-t-front.png'
import crewNeckTBack     from './assets/crew-neck-t-back.png'
import vNeckTFront       from './assets/vneck-t-front.png'
import vNeckTBack        from './assets/vneck-t-back.png'
import crewNeckLSFront   from './assets/crew-neck-ls-front.png'
import crewNeckLSBack    from './assets/crew-neck-ls-back.png'
import hoodieFront       from './assets/hoodie-front.png'
import hoodieBack        from './assets/hoodie-back.png'
import crewNeckSwFront   from './assets/crew-neck-sw-front.png'
import crewNeckSwBack    from './assets/crew-neck-sw-back.png'
import racerbackFront    from './assets/racerback-front.png'
import racerbackBack     from './assets/racerback-back.png'
import festivalFront     from './assets/festival-front.png'
import festivalBack      from './assets/festival-back.png'
import relaxedFront      from './assets/relaxed-jersey-front.png'
import relaxedBack       from './assets/relaxed-jersey-back.png'
import joggersFront      from './assets/joggers-front.png'
import joggersSide       from './assets/joggers-side.png'
import sweatpantsFront   from './assets/sweatpants-front.png'
import sweatpantsSide    from './assets/sweatpants-side.png'
import mensShortsFront   from './assets/mens-shorts-front.png'
import mensShortsSide    from './assets/mens-shorts-side.png'
import womensShorts      from './assets/womens-shorts.png'

// ── Product config map ────────────────────────────────────────────
const PRODUCTS = {
  'crew-neck-tee': {
    name: 'Crew Neck T-Shirt',
    views: [
      { key: 'front', label: 'Front', src: crewNeckTFront },
      { key: 'back',  label: 'Back',  src: crewNeckTBack  },
    ],
    graphicTop: '38%', graphicLeft: '50%', graphicWidth: '38%',
  },
  'vneck-tee': {
    name: 'V-Neck T-Shirt',
    views: [
      { key: 'front', label: 'Front', src: vNeckTFront },
      { key: 'back',  label: 'Back',  src: vNeckTBack  },
    ],
    graphicTop: '38%', graphicLeft: '50%', graphicWidth: '38%',
  },
  'crew-neck-ls': {
    name: 'Crew Neck Long Sleeve',
    views: [
      { key: 'front', label: 'Front', src: crewNeckLSFront },
      { key: 'back',  label: 'Back',  src: crewNeckLSBack  },
    ],
    graphicTop: '38%', graphicLeft: '50%', graphicWidth: '38%',
  },
  'hoodie': {
    name: 'Hoodie',
    views: [
      { key: 'front', label: 'Front', src: hoodieFront },
      { key: 'back',  label: 'Back',  src: hoodieBack  },
    ],
    graphicTop: '42%', graphicLeft: '50%', graphicWidth: '36%',
  },
  'crew-neck-sweatshirt': {
    name: 'Crew Neck Sweatshirt',
    views: [
      { key: 'front', label: 'Front', src: crewNeckSwFront },
      { key: 'back',  label: 'Back',  src: crewNeckSwBack  },
    ],
    graphicTop: '40%', graphicLeft: '50%', graphicWidth: '38%',
  },
  'racerback-tank': {
    name: 'Racerback Tank',
    views: [
      { key: 'front', label: 'Front', src: racerbackFront },
      { key: 'back',  label: 'Back',  src: racerbackBack  },
    ],
    graphicTop: '50%', graphicLeft: '50%', graphicWidth: '36%',
  },
  'festival-tank': {
    name: 'Festival Tank',
    views: [
      { key: 'front', label: 'Front', src: festivalFront },
      { key: 'back',  label: 'Back',  src: festivalBack  },
    ],
    graphicTop: '50%', graphicLeft: '50%', graphicWidth: '36%',
  },
  'relaxed-jersey-tank': {
    name: 'Relaxed Fine Jersey Tank',
    views: [
      { key: 'front', label: 'Front', src: relaxedFront },
      { key: 'back',  label: 'Back',  src: relaxedBack  },
    ],
    graphicTop: '50%', graphicLeft: '50%', graphicWidth: '36%',
  },
  'joggers': {
    name: 'Joggers',
    views: [
      { key: 'front', label: 'Front', src: joggersFront },
      { key: 'side',  label: 'Side',  src: joggersSide  },
    ],
    graphicView: 'front',
    graphicTop: '35%', graphicLeft: '42%', graphicWidth: '22%',
  },
  'sweatpants': {
    name: 'Sweatpants',
    views: [
      { key: 'front', label: 'Front', src: sweatpantsFront },
      { key: 'side',  label: 'Side',  src: sweatpantsSide  },
    ],
    graphicView: 'front',
    graphicTop: '35%', graphicLeft: '42%', graphicWidth: '22%',
  },
  'mens-shorts': {
    name: "Men's Shorts",
    views: [
      { key: 'front', label: 'Front', src: mensShortsFront },
      { key: 'side',  label: 'Side',  src: mensShortsSide  },
    ],
    graphicView: 'front',
    graphicTop: '38%', graphicLeft: '42%', graphicWidth: '24%',
  },
  'womens-shorts': {
    name: "Women's Shorts",
    views: [
      { key: 'front', label: 'Front', src: womensShorts },
    ],
    graphicView: 'front',
    graphicTop: '38%', graphicLeft: '42%', graphicWidth: '24%',
  },
}

// ── Mount function ────────────────────────────────────────────────
function mountPreviewer(el) {
  const productId = el.getAttribute('data-up-previewer')
  const config = PRODUCTS[productId]

  if (!config) {
    console.warn(`[UP Previewers] Unknown product ID: "${productId}"`)
    return
  }

  // compact=true removes the dark outer wrapper — fits inline in the store
  const compact = el.hasAttribute('data-up-compact')

  createRoot(el).render(
    <React.StrictMode>
      <ColorPreviewer
        productName={config.name}
        views={config.views}
        graphicView={config.graphicView || 'front'}
        graphicTop={config.graphicTop}
        graphicLeft={config.graphicLeft}
        graphicWidth={config.graphicWidth}
        compact={compact}
      />
    </React.StrictMode>
  )
}

// ── Auto-mount on DOM ready ───────────────────────────────────────
function init() {
  document.querySelectorAll('[data-up-previewer]').forEach(mountPreviewer)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}

// ── Expose global for manual mounting ────────────────────────────
// Usage: window.UPPreviewers.mount(document.getElementById('my-div'), 'hoodie')
window.UPPreviewers = {
  mount: (el, productId) => {
    el.setAttribute('data-up-previewer', productId)
    mountPreviewer(el)
  },
  mountAll: init,
  products: Object.keys(PRODUCTS),
}
