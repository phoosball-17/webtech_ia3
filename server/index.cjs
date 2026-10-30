// Prompt Pond local server. Node.js built-in modules only.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const HOST = '127.0.0.1';
const PORT = Number(process.env.POND_PORT ?? 8787);
const DOCS = path.resolve(__dirname, '..', 'docs');
const DATA_FILE = process.env.POND_DATA_FILE ||
  path.resolve(__dirname, 'data', 'summaries.json');

const ALLOWED = new Set([
  'http://127.0.0.1:8787',
  'http://localhost:8787',
  process.env.POND_ALLOWED_ORIGIN || ''
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

let summaries = Object.create(null);
let writeQueue = Promise.resolve();

function reply(res, status, value, extra = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extra
  });
  res.end(JSON.stringify(value));
}

function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

function validate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'Expected an activity summary.';
  }
  if (!Number.isSafeInteger(value.total) ||
      value.total < 1 || value.total > 10000000) {
    return 'Total must be between 1 and 10,000,000.';
  }
  if (!['manual', 'export'].includes(value.mode) ||
      !Array.isArray(value.days) || value.days.length > 20000) {
    return 'Invalid summary format.';
  }
  if (value.mode === 'manual' && value.days.length) {
    return 'Manual entries cannot include daily activity.';
  }

  let dated = 0;
  let last = '';
  for (const day of value.days) {
    if (!day || !validDay(day.date) ||
        !Number.isSafeInteger(day.count) ||
        day.count < 1 || day.count > 10000000 ||
        day.date <= last) {
      return 'Daily counts must have unique sorted dates and positive whole numbers.';
    }
    dated += day.count;
    last = day.date;
  }
  return dated > value.total
    ? 'Dated prompts cannot exceed the total.'
    : null;
}

async function save() {
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(path.dirname(DATA_FILE), {recursive: true});
    const temp = `${DATA_FILE}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(summaries), 'utf8');
    await fs.rename(temp, DATA_FILE);
  });
  return writeQueue;
}

async function readBody(req) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 200000) {
      const error = new Error('Summary is too large.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function handleApi(req, res, pathname) {
  const origin = req.headers.origin;
  if (origin && !ALLOWED.has(origin)) {
    return reply(res, 403, {error: 'This website origin is not allowed.'});
  }

  const cors = origin ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Vary': 'Origin'
  } : {};

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {...cors, 'Access-Control-Max-Age': '86400'});
    return res.end();
  }
  if (pathname === '/api/health' && req.method === 'GET') {
    return reply(res, 200, {ok: true}, cors);
  }
  if (pathname !== '/api/summary') {
    return reply(res, 404, {error: 'Not found.'}, cors);
  }
  if (!['GET', 'PUT', 'DELETE'].includes(req.method)) {
    return reply(res, 405, {error: 'Method not allowed.'}, {
      ...cors, Allow: 'GET, PUT, DELETE, OPTIONS'
    });
  }

  const token =
    /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1];
  if (!token) {
    return reply(res, 401, {error: 'A valid browser key is required.'}, cors);
  }
  const id = crypto.createHash('sha256').update(token).digest('hex');

  if (req.method === 'GET') {
    return reply(res, 200, {summary: summaries[id] || null}, cors);
  }
  if (req.method === 'DELETE') {
    delete summaries[id];
    await save();
    return reply(res, 200, {deleted: true}, cors);
  }

  let value;
  try {
    value = JSON.parse(await readBody(req));
  } catch (error) {
    return reply(res, error.status || 400, {
      error: error.status ? error.message : 'Expected valid JSON.'
    }, cors);
  }

  const error = validate(value);
  if (error) return reply(res, 400, {error}, cors);

  summaries[id] = {
    total: value.total,
    mode: value.mode,
    days: value.days
  };
  await save();
  return reply(res, 200, {saved: true}, cors);
}

async function handleStatic(res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return reply(res, 400, {error: 'Invalid path.'});
  }

  const file = path.resolve(
    DOCS,
    `.${decoded === '/' ? '/index.html' : decoded}`
  );
  if (!file.startsWith(DOCS + path.sep)) {
    return reply(res, 403, {error: 'Forbidden.'});
  }

  try {
    const bytes = await fs.readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(bytes);
  } catch {
    reply(res, 404, {error: 'File not found.'});
  }
}

async function start() {
  try {
    summaries = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${HOST}:${PORT}`);
      if (url.pathname.startsWith('/api/')) {
        await handleApi(req, res, url.pathname);
      } else if (req.method === 'GET') {
        await handleStatic(res, url.pathname);
      } else {
        reply(res, 405, {error: 'Method not allowed.'});
      }
    } catch (error) {
      console.error(error);
      if (!res.headersSent) reply(res, 500, {error: 'Server error.'});
      else res.end();
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`Prompt Pond: http://${HOST}:${server.address().port}`);
  });
  return server;
}

if (require.main === module) {
  start().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
module.exports = {start, validate};