import { useState, useRef } from 'react'
import { APPAREL_COLORS } from './brand'

/**
 * ColorPreviewer — shared base for all product color preview components.
 *
 * Props:
 *   productName  {string}   — displayed subtitle e.g. "HOODIE"
 *   views        {Array}    — [{ key: 'front', label: 'Front', src: '...' }, ...]
 *   graphicView  {string}   — which view key shows the graphic overlay (default: 'front')
 *   graphicTop   {string}   — CSS top % for graphic placement (default: '38%')
 *   graphicLeft  {string}   — CSS left % for graphic placement (default: '50%')
 *   graphicWidth {string}   — CSS width % for graphic (default: '38%')
 *   defaultColor {number}   — index into APPAREL_COLORS to select on mount (default: 2 = Hot Pink)
 *   compact      {boolean}  — render without the dark outer wrapper (for embedding in site)
 */
export default function ColorPreviewer({
  productName,
  views,
  graphicView = 'front',
  graphicTop = '38%',
  graphicLeft = '50%',
  graphicWidth = '38%',
  defaultColor = 2,
  compact = false,
}) {
  const [selectedColor, setSelectedColor] = useState(APPAREL_COLORS[defaultColor])
  const [activeView, setActiveView] = useState(views[0]?.key || 'front')
  const [graphic, setGraphic] = useState(null)
  const fileInputRef = useRef(null)

  const currentSrc = views.find(v => v.key === activeView)?.src || views[0]?.src

  function handleUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setGraphic(ev.target.result)
    reader.readAsDataURL(file)
  }

  const card = (
    <div style={{
      background: '#f0f0f0',
      borderRadius: '20px',
      padding: '32px 28px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '20px',
      boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
      maxWidth: '400px',
      width: '100%',
    }}>

      {/* VIEW TOGGLE — only show if more than one view */}
      {views.length > 1 && (
        <div style={{
          display: 'flex',
          background: '#e0e0e0',
          borderRadius: '30px',
          padding: '3px',
          gap: '2px',
        }}>
          {views.map((v) => (
            <button
              key={v.key}
              onClick={() => setActiveView(v.key)}
              style={{
                padding: '7px 22px',
                borderRadius: '30px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '700',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                transition: 'all 0.15s ease',
                background: activeView === v.key ? '#e91e8c' : 'transparent',
                color: activeView === v.key ? '#fff' : '#888',
                boxShadow: activeView === v.key ? '0 2px 8px rgba(233,30,140,0.35)' : 'none',
                fontFamily: "'Barlow Condensed', sans-serif",
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      {/* GARMENT + COLOR OVERLAY */}
      <div style={{
        position: 'relative',
        width: '320px',
        height: '320px',
        isolation: 'isolate',
      }}>
        <img
          src={currentSrc}
          alt={`${productName} ${activeView}`}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            display: 'block',
          }}
        />
        {/* multiply blend tint layer */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: selectedColor.hex,
          maskImage: `url(${currentSrc})`,
          WebkitMaskImage: `url(${currentSrc})`,
          maskSize: 'contain',
          WebkitMaskSize: 'contain',
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskPosition: 'center',
          mixBlendMode: 'multiply',
        }} />
        {/* Graphic overlay — only on the designated view */}
        {graphic && activeView === graphicView && (
          <div style={{
            position: 'absolute',
            top: graphicTop,
            left: graphicLeft,
            transform: 'translate(-50%, -50%)',
            width: graphicWidth,
            pointerEvents: 'none',
          }}>
            <img
              src={graphic}
              alt="custom design"
              style={{ width: '100%', height: 'auto', objectFit: 'contain' }}
            />
          </div>
        )}
      </div>

      {/* SELECTED COLOR LABEL */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '18px', height: '18px', borderRadius: '50%',
          background: selectedColor.hex, border: '2px solid #bbb', flexShrink: 0,
        }} />
        <span style={{
          fontWeight: '700', fontSize: '14px', color: '#222', letterSpacing: '0.5px',
          fontFamily: "'Barlow Condensed', sans-serif",
        }}>
          {selectedColor.name}
        </span>
      </div>

      {/* COLOR SWATCHES */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center' }}>
        {APPAREL_COLORS.map((color) => (
          <button
            key={color.hex}
            onClick={() => setSelectedColor(color)}
            title={color.name}
            style={{
              width: '34px', height: '34px', borderRadius: '50%',
              background: color.hex,
              border: selectedColor.hex === color.hex
                ? '3px solid #e91e8c'
                : color.hex === '#ffffff' ? '2px solid #bbb' : '2px solid #ccc',
              cursor: 'pointer',
              boxShadow: selectedColor.hex === color.hex
                ? '0 0 0 2px #f0f0f0, 0 0 0 4px #e91e8c'
                : '0 2px 4px rgba(0,0,0,0.2)',
              transition: 'all 0.15s ease',
              outline: 'none',
              flexShrink: 0,
            }}
          />
        ))}
      </div>

      {/* GRAPHIC UPLOAD */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleUpload}
        style={{ display: 'none' }}
      />
      <button
        onClick={() => fileInputRef.current.click()}
        style={{
          marginTop: '4px',
          padding: '10px 24px',
          background: '#e91e8c',
          color: '#fff',
          border: 'none',
          borderRadius: '30px',
          fontSize: '13px',
          fontWeight: '700',
          letterSpacing: '1px',
          cursor: 'pointer',
          textTransform: 'uppercase',
          boxShadow: '0 4px 14px rgba(233,30,140,0.4)',
          fontFamily: "'Barlow Condensed', sans-serif",
        }}
      >
        {graphic ? 'Change Graphic' : 'Upload Graphic'}
      </button>
      {graphic && (
        <button
          onClick={() => setGraphic(null)}
          style={{
            padding: '6px 16px',
            background: 'transparent',
            color: '#999',
            border: '1px solid #ccc',
            borderRadius: '30px',
            fontSize: '11px',
            cursor: 'pointer',
            marginTop: '-10px',
            fontFamily: "'Barlow Condensed', sans-serif",
          }}
        >
          Remove Graphic
        </button>
      )}
    </div>
  )

  if (compact) return card

  return (
    <div style={{
      minHeight: '100vh',
      background: '#1a1a2e',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Barlow', sans-serif",
      padding: '24px',
    }}>
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <h1 style={{
          color: '#fff',
          fontSize: '20px',
          fontWeight: '800',
          letterSpacing: '3px',
          textTransform: 'uppercase',
          margin: 0,
          fontFamily: "'Barlow Condensed', sans-serif",
        }}>
          Under Pressure Custom Apparel
        </h1>
        <p style={{
          color: '#aaa', fontSize: '12px', marginTop: '6px', letterSpacing: '1px',
          fontFamily: "'Barlow Condensed', sans-serif",
        }}>
          {productName} — COLOR PREVIEW
        </p>
      </div>
      {card}
    </div>
  )
}
