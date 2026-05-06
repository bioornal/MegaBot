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
      args: '--env-file=.env src/worker/index.ts',
      cwd: './',
      env: {
        NODE_ENV: 'production',
        TENANT_ID: 'megamuebles',
        WORKER_PORT: 3001,
        DATA_DIR: './data/megamuebles',
        SUPABASE_PRODUCTS_TABLE: 'products',
        SUPABASE_COMPANY_INFO_TABLE: 'info_empresa',
      },
    },
    {
      name: 'worker-iguazufalls',
      script: './node_modules/.bin/tsx',
      args: '--env-file=.env src/worker/index.ts',
      cwd: './',
      env: {
        NODE_ENV: 'production',
        TENANT_ID: 'iguazufalls',
        WORKER_PORT: 3002,
        DATA_DIR: './data/iguazufalls',
        SUPABASE_PRODUCTS_TABLE: 'products_iguazufalls',
        SUPABASE_COMPANY_INFO_TABLE: 'info_empresa_iguazufalls',
      },
    },
    {
      name: 'worker-impasto',
      script: './node_modules/.bin/tsx',
      args: '--env-file=.env src/worker/index.ts',
      cwd: './',
      env: {
        NODE_ENV: 'production',
        TENANT_ID: 'impasto',
        WORKER_PORT: 3003,
        DATA_DIR: './data/impasto',
        SUPABASE_PRODUCTS_TABLE: 'products_impasto',
        SUPABASE_COMPANY_INFO_TABLE: 'info_empresa_impasto',
      },
    },
  ],
};