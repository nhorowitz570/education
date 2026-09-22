import {
  monitorVoices,
  runJobs,
  sendReminders,
  shutdownVoices,
} from '../src/lib/server/jobs';
let stopping = false;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function loop(name: string, period: number, task: () => Promise<void>) {
  while (!stopping) {
    try {
      await task();
    } catch {
      console.error(`${name} failed; retrying. No private data logged.`);
    }
    await sleep(period);
  }
}
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, async () => {
    stopping = true;
    await shutdownVoices();
    setTimeout(() => process.exit(0), 15000);
  });
console.log(
  'Fieldwork worker started: voice monitor, durable jobs, reminders.',
);
await Promise.all([
  loop('Voice monitor', 2000, monitorVoices),
  loop('Jobs', 10000, runJobs),
  loop('Reminders', 30000, sendReminders),
]);
