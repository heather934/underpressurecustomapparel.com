import { useParams } from 'react-router-dom'
import {
  CrewNeckT, VNeckT, CrewNeckLongSleeve, Hoodie, CrewNeckSweatshirt,
  RacerbackTank, FestivalTank, RelaxedFineJerseyTank,
  Joggers, SweatPants, MensShorts, WomensShorts,
} from '../components/products'

const PRODUCT_MAP = {
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

export default function ProductPage() {
  const { productId } = useParams()
  const Component = PRODUCT_MAP[productId]

  if (!Component) {
    return (
      <div style={{
        minHeight: '100vh', background: '#060810',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#5a7296', fontFamily: "'Barlow Condensed', sans-serif",
        fontSize: '14px', letterSpacing: '2px', textTransform: 'uppercase',
      }}>
        Product not found
      </div>
    )
  }

  return <Component />
}
