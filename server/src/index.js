import { createApp } from './app.js';
import { makeVerifier } from './auth.js';
import { missingSettings, readConfig } from './config.js';
import { makeFetchPage } from './fetchPage.js';
import { makeCallModel } from './groq.js';
import { keepAliveSettings, startKeepAlive } from './keepAlive.js';

const config = readConfig();
const problems = missingSettings(config);
if (problems.length) {
  console.error(`DevScale AI server can't start:\n - ${problems.join('\n - ')}\nCopy .env.example to .env and fill it in.`);
  process.exit(1);
}

const app = createApp({
  config,
  verify: makeVerifier({ issuer: config.issuer, origins: config.origins }),
  callModel: makeCallModel({ key: config.groqKey, base: config.groqBase, model: config.model }),
  fetchPage: makeFetchPage(),
});

app.listen(config.port, () => {
  console.log(`DevScale AI server listening on http://localhost:${config.port}`);
  console.log(`  model: ${config.model}`);
  console.log(`  browsers allowed: ${config.origins.join(', ')}`);
  console.log(`  sign-ins checked against: ${config.issuer}`);
  const keep = keepAliveSettings();
  if (keep) { startKeepAlive(keep); console.log(`  keep-alive: ${keep.url} every ${keep.seconds}s`); }
});
