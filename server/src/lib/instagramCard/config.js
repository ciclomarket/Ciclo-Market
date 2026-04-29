'use strict'

const CARD_CONFIG = {
  width: 1080,
  height: 1350,
  colors: {
    background: '#0B111A',
    primary: '#14212E',
    accent: '#00BFFF',
    accentSecondary: '#7C3AED',
    text: '#FFFFFF',
    textMuted: '#94A3B8',
    priceBg: '#00BFFF',
    priceText: '#0B111A',
    categoryBg: 'rgba(255,255,255,0.08)',
    categoryText: '#CBD5E1',
    divider: 'rgba(255,255,255,0.10)',
    imageFallback: '#1E2D3D',
    watermarkText: 'rgba(255,255,255,0.25)',
  },
  fonts: {
    // System stacks that render well in Puppeteer
    title: "'Arial Black', 'Impact', 'Helvetica Neue', sans-serif",
    body: "'Helvetica Neue', 'Arial', sans-serif",
    price: "'Arial Black', 'Impact', sans-serif",
  },
  brand: {
    name: 'ciclomarket.ar',
    tagline: 'Marketplace de ciclismo',
    logoUrl: null,
  },
}

module.exports = CARD_CONFIG
