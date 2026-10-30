const test=require('node:test');
const assert=require('node:assert/strict');
const logic=require('../docs/logic.js');

test('counts user messages once, including undated messages, without reading their text',()=>{
  const input=[{id:'chat1',mapping:{a:{message:{id:'1',author:{role:'user'},create_time:1725148800,content:{parts:['private']}}},b:{message:{id:'2',author:{role:'assistant'},create_time:1725148800}},c:{message:{id:'3',author:{role:'user'},create_time:null}}}},{id:'chat2',mapping:{x:{message:{id:'1',author:{role:'user'},create_time:1725235200}}}}];
  assert.deepEqual(logic.parseExport(input),{total:2,mode:'export',days:[{date:'2024-09-01',count:1}]});
});

test('rejects unsupported exports and computes dated streaks',()=>{
  assert.throws(()=>logic.parseExport({foo:'bar'}),/supported/);
  const summary={total:7,days:[{date:'2026-01-01',count:2},{date:'2026-01-02',count:1},{date:'2026-01-05',count:4}]};
  assert.equal(logic.stats(summary).longest,2);
  assert.equal(logic.stats(summary).busiest.date,'2026-01-05');
  assert.deepEqual(logic.rangeDays(summary.days,'7'),summary.days);
});
