import { BrowserRouter, Routes, Route } from 'react-router-dom'
import '../src/styles/globals.css'

// Pages
import MainStore   from './pages/MainStore'
import AdminPanel  from './pages/AdminPanel'
import ProductPage from './pages/ProductPage'
import RampagePage from './pages/RampagePage'
import RomePage    from './pages/RomePage'
import CanvaGuide  from './pages/CanvaGuide'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public store */}
        <Route path="/"        element={<MainStore />} />

        {/* Individual product color previewer pages */}
        <Route path="/product/:productId" element={<ProductPage />} />

        {/* Team stores */}
        <Route path="/rampage" element={<RampagePage />} />
        <Route path="/rome"    element={<RomePage />} />

        {/* Admin */}
        <Route path="/admin"   element={<AdminPanel />} />

        {/* Canva guide */}
        <Route path="/canva"   element={<CanvaGuide />} />
      </Routes>
    </BrowserRouter>
  )
}
