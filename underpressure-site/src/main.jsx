import { useEffect } from 'react'

export default function MainStore() {
  useEffect(() => {
    window.location.replace('/store.html')
  }, [])
  return null
}
