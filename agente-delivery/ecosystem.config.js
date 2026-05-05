module.exports = {
  apps: [
    {
      name: 'next',
      script: 'npm',
      args: 'run next:start',
      cwd: './',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
    {
      name: 'worker-megamuebles',
      script: './node_modules/.bin/tsx',
      args: 'src/worker/index.ts',
      cwd: './',
      env: {
        NODE_ENV: 'production',
        TENANT_ID: 'megamuebles',
        WORKER_PORT: 3001,
        DATA_DIR: './data/megamuebles',
      },
    },
    {
      name: 'worker-iguazufalls',
      script: './node_modules/.bin/tsx',
      args: 'src/worker/index.ts',
      cwd: './',
      env: {
        NODE_ENV: 'production',
        TENANT_ID: 'iguazufalls',
        WORKER_PORT: 3002,
        DATA_DIR: './data/iguazufalls',
      },
    },
    {
      name: 'worker-impasto',
      script: './node_modules/.bin/tsx',
      args: 'src/worker/index.ts',
      cwd: './',
      env: {
        NODE_ENV: 'production',
        TENANT_ID: 'impasto',
        WORKER_PORT: 3003,
        DATA_DIR: './data/impasto',
      },
    },
  ],
};
