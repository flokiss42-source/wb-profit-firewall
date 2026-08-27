import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateReport, analyzeReport } from '../src/analyze.js';

test('разделяет продажи и возвраты и суммирует расходы',()=>{const rows=[
  {nm_id:1,sa_name:'A',doc_type_name:'Продажа',quantity:2,retail_amount:2000,ppvz_for_pay:1400,delivery_rub:100},
  {nm_id:1,sa_name:'A',doc_type_name:'Возврат',quantity:1,retail_amount:-1000,ppvz_for_pay:-700,delivery_rub:80,penalty:50}
];const [item]=aggregateReport(rows);assert.equal(item.sold,2);assert.equal(item.returned,1);assert.equal(item.grossSales,1000);assert.equal(item.logistics,180);assert.equal(item.penalties,50)});

test('не показывает прибыль без себестоимости',()=>{const result=analyzeReport([{nm_id:1,doc_type_name:'Продажа',quantity:1,retail_amount:1000,ppvz_for_pay:700}]);assert.equal(result.products[0].profit,null);assert.equal(result.products[0].severity,'unknown');assert.equal(result.summary.profit,null)});

test('находит убыточный товар и рассчитывает безопасную цену',()=>{const result=analyzeReport([{nm_id:1,doc_type_name:'Продажа',quantity:2,retail_amount:2000,ppvz_for_pay:1200,delivery_rub:200}],{taxPercent:6,targetMargin:15,costs:{1:600}});const item=result.products[0];assert.ok(item.profit<0);assert.equal(item.severity,'loss');assert.ok(item.safePrice>600)});

test('не допускает HTML и числовой мусор в вычисления',()=>{const result=analyzeReport([{nm_id:1,sa_name:'<script>',doc_type_name:'Продажа',quantity:'x',retail_amount:'bad',ppvz_for_pay:Infinity}],{costs:{1:'bad'}});assert.equal(result.summary.grossSales,0);assert.equal(result.products[0].profit,null)});
