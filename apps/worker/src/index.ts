import { DaynoriWorker } from './worker.js';

const worker = new DaynoriWorker();
worker.start();
console.log('Daynori Worker running...');

process.on('SIGTERM', () => {
  console.log('Stopping Daynori Worker...');
  worker.stop();
  process.exit(0);
});
