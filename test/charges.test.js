import assert from 'node:assert/strict';import test from 'node:test';import {findUnexplainedCharges} from '../src/charges.js';
test('выделяет неизвестные списания',()=>{const r=findUnexplainedCharges([{amount:-120,doc_type_name:'Перенос долга'},{amount:-80,doc_type_name:'Логистика'}]);assert.equal(r.length,1);assert.equal(r[0].label,'Перенос долга')});
