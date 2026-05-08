// agente-delivery/src/tenants.config.ts
import path from 'node:path'

export interface TenantTheme {
  primary: string
  accent: string
  bg: string
  surface: string
  border: string
  textMuted: string
  glow: string
}

export interface Tenant {
  id: string
  email: string
  name: string
  botName: string
  workerUrl: string
  dataDir: string
  productsTable: string
  companyInfoTable: string
  dataSource?: 'supabase' | 'insforge'
  theme: TenantTheme
}

export const TENANTS: Tenant[] = [
  {
    id: 'megamuebles',
    email: 'megamuebles.lafalda@gmail.com',
    name: 'Mega Muebles & Sommiers',
    botName: 'Sofía',
    workerUrl: 'http://127.0.0.1:3001',
    dataDir: path.resolve('./data/megamuebles'),
    productsTable: 'products',
    companyInfoTable: 'info_empresa',
    theme: {
      primary:   '#22d986',
      accent:    '#0fa860',
      bg:        '#060a0f',
      surface:   '#0d1219',
      border:    '#1c2836',
      textMuted: '#3d5268',
      glow:      'rgba(34,217,134,0.28)',
    },
  },
  {
    id: 'iguazufalls',
    email: 'juanynatyzapata@hotmail.com',
    name: 'IguazuFalls',
    botName: 'Paula',
    workerUrl: 'http://127.0.0.1:3002',
    dataDir: path.resolve('./data/iguazufalls'),
    productsTable: 'products_iguazufalls',
    companyInfoTable: 'info_empresa_iguazufalls',
    theme: {
      primary:   '#c084fc',
      accent:    '#ec4899',
      bg:        '#08040f',
      surface:   '#110820',
      border:    '#2d1a47',
      textMuted: '#5a3a7a',
      glow:      'rgba(192,132,252,0.28)',
    },
  },
  {
    id: 'impasto',
    email: 'spezialichristian@gmail.com',
    name: 'Impasto',
    botName: 'Chris',
    workerUrl: 'http://127.0.0.1:3003',
    dataDir: path.resolve('./data/impasto'),
    productsTable: 'productos',
    companyInfoTable: 'info_empresa_impasto',
    dataSource: 'insforge',
    theme: {
      primary:   '#60a5fa',
      accent:    '#2563eb',
      bg:        '#030a12',
      surface:   '#071220',
      border:    '#0f2a47',
      textMuted: '#1a3a5a',
      glow:      'rgba(96,165,250,0.28)',
    },
  },
]

export function getTenantByEmail(email: string): Tenant | null {
  return TENANTS.find(t => t.email.toLowerCase() === email.toLowerCase()) ?? null
}

export function getTenantById(id: string): Tenant | null {
  return TENANTS.find(t => t.id === id) ?? null
}
