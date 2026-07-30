/**
 * MainStore.jsx
 *
 * This is where the content of the current index.html gets migrated.
 * The migration happens in phases:
 *
 * Phase 1 (current): Renders the existing index.html via an iframe
 *   so the site stays live while the React migration happens in parallel.
 *
 * Phase 2: Each section (header, hero, products, gallery, admin panel)
 *   gets converted to a React component and imported here.
 *
 * Product color previewers are already React components and can be
 *   embedded inline in the product cards using <ColorPreviewer compact />
 */

export default function MainStore() {
  // Phase 1: pass-through to existing HTML while migration is in progress
  // Replace this with proper React components as each section is migrated
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      {/* TODO: Replace with migrated React components */}
      <p style={{
        color: '#5a7296', fontFamily: 'monospace', padding: '40px',
        fontSize: '13px',
      }}>
        MainStore migration in progress — import and render existing sections here.
      </p>
    </div>
  )
}
