// PM2 multi-tenant.
//
// Cada worker carga su .env.{tenant} via tsx --env-file. Ese archivo
// trae: TENANT_ID, WORKER_PORT, DATA_DIR, SUPABASE_PRODUCTS_TABLE,
// SUPABASE_COMPANY_INFO_TABLE + las claves compartidas.
//
// Next.js (proceso "next") carga solo .env.local — NUNCA debe ver
// TENANT_ID/WORKER_PORT/DATA_DIR de un tenant en particular: el routing
// es por sesion via tenant.workerUrl en tenants.config.ts.
//
// Deploy:
//   pm2 delete all
//   pm2 start ecosystem.config.js
//   pm2 save
//
// (delete + start, NO restart: PM2 cachea env del primer spawn).

module.exports = {
  apps: [
    {
      name: 'next',
      script: 'npm',
      args: 'run start',
      cwd: './',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
    {
      name: 'worker-megamuebles',
      script: './node_modules/.bin/tsx',
      args: '--env-file=.env.megamuebles src/worker/index.ts',
      cwd: './',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'worker-iguazufalls',
      script: './node_modules/.bin/tsx',
      args: '--env-file=.env.iguazufalls src/worker/index.ts',
      cwd: './',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'worker-impasto',
      script: './node_modules/.bin/tsx',
      args: '--env-file=.env.impasto src/worker/index.ts',
      cwd: './',
      env: { NODE_ENV: 'production' },
    },
  ],
};
