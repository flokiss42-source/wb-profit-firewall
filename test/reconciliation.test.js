import assert from 'node:assert/strict';import test from 'node:test';import {reconcileMovement} from '../src/reconciliation.js';
test('сверяет движение и выявляет возможную потерю',()=>{const r=reconcileMovement({accepted:100,sold:60,returned:5,stock:30,inTransit:0,writtenOff:0});assert.equal(r.expectedStock,45);assert.equal(r.gap,15);assert.equal(r.status,'potential-loss')});
test('не считает списание потерей',()=>{const r=reconcileMovement({accepted:100,sold:60,returned:5,stock:30,writtenOff:15});assert.equal(r.gap,0);assert.equal(r.status,'matched')});
