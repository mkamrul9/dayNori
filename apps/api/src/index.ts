import { buildServer } from './server.js';

const port = Number(process.env['PORT'] ?? 3001);
const host = process.env['HOST'] ?? '0.0.0.0';

const server = buildServer();

server.listen({ port, host }, (err, address) => {
  if (err) {
    console.error('Failed to start Daynori API server:', err);
    process.exit(1);
  }
  console.log(`Daynori API listening at ${address}`);
});
