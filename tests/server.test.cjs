const test = require('node:test');
const assert = require('node:assert/strict');
const {once} = require('node:events');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');

process.env.POND_PORT = '0';
process.env.POND_DATA_FILE =
  path.join(os.tmpdir(), `prompt-pond-test-${process.pid}.json`);

const {start, validate} = require('../server/index.cjs');

test('server rejects invalid daily counts', () => {
  assert.equal(validate({total:4, mode:'manual', days:[]}), null);
  assert.match(
    validate({total:1, mode:'export',
      days:[{date:'2026-01-01', count:2}]}),
    /exceed/
  );
  assert.match(
    validate({total:2, mode:'export',
      days:[{date:'2026-02-30', count:1}]}),
    /unique/
  );
});

test('server saves, restores and deletes a summary', async () => {
  const server = await start();
  if (!server.listening) await once(server, 'listening');

  try {
    const url =
      `http://127.0.0.1:${server.address().port}/api/summary`;
    const headers = {Authorization:`Bearer ${'a'.repeat(64)}`};
    const summary = {
      total:4,
      mode:'export',
      days:[{date:'2026-01-01', count:3}]
    };

    const saved = await fetch(url, {
      method:'PUT',
      headers:{...headers, 'Content-Type':'application/json'},
      body:JSON.stringify(summary)
    });
    assert.equal(saved.status, 200);

    assert.deepEqual(
      (await (await fetch(url, {headers})).json()).summary,
      summary
    );
    assert.deepEqual(
      await (await fetch(url, {method:'DELETE', headers})).json(),
      {deleted:true}
    );
    assert.equal(
      (await (await fetch(url, {headers})).json()).summary,
      null
    );
  } finally {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(process.env.POND_DATA_FILE, {force:true});
  }
});