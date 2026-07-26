import { getConfig } from './config';

class ApiError extends Error {}

function buildGetUrl(baseUrl, token, params = {}) {
  const url = new URL(baseUrl);
  url.searchParams.set('token', token);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

async function post(baseUrl, token, action, payload) {
  const res = await fetch(baseUrl, {
    method: 'POST',
    // Deliberately no Content-Type header: a JSON string body defaults to
    // text/plain, which keeps this a CORS "simple request" (no preflight).
    // Apps Script parses e.postData.contents as JSON regardless of the
    // declared mime type.
    body: JSON.stringify({ token, action, payload }),
  });
  if (!res.ok) throw new ApiError(`Request failed (${res.status})`);
  const data = await res.json();
  if (!data.ok) throw new ApiError(data.error || 'Unknown error');
  return data;
}

export async function ping(url, token) {
  const res = await fetch(buildGetUrl(url, token, { action: 'ping' }));
  if (!res.ok) throw new ApiError(`Request failed (${res.status})`);
  const data = await res.json();
  if (!data.ok) throw new ApiError(data.error || 'Could not connect');
  return data;
}

function requireConfig() {
  const cfg = getConfig();
  if (!cfg) throw new ApiError('Not configured');
  return cfg;
}

export async function fetchJobs() {
  const { url, token } = requireConfig();
  const res = await fetch(buildGetUrl(url, token));
  if (!res.ok) throw new ApiError(`Request failed (${res.status})`);
  const data = await res.json();
  if (!data.ok) throw new ApiError(data.error || 'Could not load jobs');
  return data.jobs;
}

export async function createJob(job) {
  const { url, token } = requireConfig();
  const data = await post(url, token, 'create', job);
  return data.job;
}

export async function updateJob(id, patch) {
  const { url, token } = requireConfig();
  const data = await post(url, token, 'update', { id, ...patch });
  return data.job;
}

export async function deleteJob(id) {
  const { url, token } = requireConfig();
  await post(url, token, 'delete', { id });
}

export async function bulkImportJobs(jobs) {
  const { url, token } = requireConfig();
  const data = await post(url, token, 'bulkImport', { jobs });
  return data.count;
}

export async function askAI(question, history = []) {
  const { url, token } = requireConfig();
  const data = await post(url, token, 'askAI', { question, history });
  return data.answer;
}

export async function fetchLeetcode() {
  const { url, token } = requireConfig();
  const res = await fetch(buildGetUrl(url, token, { action: 'leetcode' }));
  if (!res.ok) throw new ApiError(`Request failed (${res.status})`);
  const data = await res.json();
  if (!data.ok) throw new ApiError(data.error || 'Could not load LeetCode progress');
  return data;
}

export async function updateLeetcodeStatus(row, status) {
  const { url, token } = requireConfig();
  await post(url, token, 'updateLeetcode', { row, status });
}

export { ApiError };
