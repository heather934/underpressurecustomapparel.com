/**
 * AdminPanel.jsx
 *
 * The admin panel lives here. It's PIN-protected and only accessible
 * at /admin. Existing admin logic from index.html gets migrated into
 * React components in this file.
 *
 * Product color previewers are embedded here using <Component compact />
 * so Erin can preview colors while managing gallery entries.
 */

import { useState } from 'react'
import {
  CrewNeckT, VNeckT, CrewNeckLongSleeve, Hoodie, CrewNeckSweatshirt,
  RacerbackTank, FestivalTank, RelaxedFineJerseyTank,
  Joggers, SweatPants, MensShorts, WomensShorts,
} from '../components/products'
import { APPAREL_ITEMS } from '../data/brand'

// Map of item id → component
const PREVIEWER_MAP = {
  'crew-neck-tee':        CrewNeckT,
  'vneck-tee':            VNeckT,
  'crew-neck-ls':         CrewNeckLongSleeve,
  'hoodie':               Hoodie,
  'crew-neck-sweatshirt': CrewNeckSweatshirt,
  'racerback-tank':       RacerbackTank,
  'festival-tank':        FestivalTank,
  'relaxed-jersey-tank':  RelaxedFineJerseyTank,
  'joggers':              Joggers,
  'sweatpants':           SweatPants,
  'mens-shorts':          MensShorts,
  'womens-shorts':        WomensShorts,
}

export default function AdminPanel() {
  const [activeProduct, setActiveProduct] = useState(null)
  const PreviewComponent = activeProduct ? PREVIEWER_MAP[activeProduct] : null

  return (
    <div style={{
      minHeight: '100vh',
      background: '#060810',
      color: '#eef2fb',
      fontFamily: "'Barlow', sans-serif",
      padding: '40px',
    }}>
      <h1 style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: '32px',
        letterSpacing: '3px',
        color: '#4d9fff',
        marginBottom: '8px',
      }}>
        Admin Panel
      </h1>
      <p style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontSize: '12px',
        letterSpacing: '2px',
        color: '#5a7296',
        textTransform: 'uppercase',
        marginBottom: '32px',
      }}>
        Under Pressure Custom Apparel · Content Manager
      </p>

      {/* PRODUCT PREVIEWER SELECTOR */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: '14px',
          letterSpacing: '3px',
          color: '#5a7296',
          textTransform: 'uppercase',
          marginBottom: '16px',
        }}>
          Product Color Previewers
        </h2>

        {/* Group items by category */}
        {['Tops', 'Tanks', 'Bottoms'].map(group => (
          <div key={group} style={{ marginBottom: '20px' }}>
            <div style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: '11px',
              letterSpacing: '2px',
              color: '#5a7296',
              textTransform: 'uppercase',
              marginBottom: '8px',
            }}>
              {group}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {APPAREL_ITEMS.filter(i => i.group === group).map(item => (
                <button
                  key={item.id}
                  onClick={() => setActiveProduct(activeProduct === item.id ? null : item.id)}
                  style={{
                    padding: '8px 16px',
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontSize: '12px',
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    border: activeProduct === item.id ? '1px solid #e91e8c' : '1px solid #1e2d4a',
                    background: activeProduct === item.id ? 'rgba(233,30,140,0.15)' : '#111827',
                    color: activeProduct === item.id ? '#e91e8c' : '#c8d4e8',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Inline previewer */}
        {PreviewComponent && (
          <div style={{
            marginTop: '24px',
            border: '1px solid #1e2d4a',
            padding: '24px',
            background: '#111827',
            display: 'flex',
            justifyContent: 'center',
          }}>
            <PreviewComponent compact />
          </div>
        )}
      </section>

      {/* TODO: Migrate remaining admin panel sections from index.html */}
      <p style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontSize: '12px',
        letterSpacing: '1px',
        color: '#5a7296',
      }}>
        Gallery, production, team stores, and other admin sections coming in Phase 2 migration.
      </p>
    </div>
  )
}
