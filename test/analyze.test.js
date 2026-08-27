import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateReport, analyzeReport, analyzeInventory, compareAnalyses, evaluateRules, forecastCashflow, simulateProduct } from '../src/analyze.js';

test('разделяет продажи и возвраты и суммирует расходы',()=>{const rows=[
  {nm_id:1,sa_name:'A',doc_type_name:'Продажа',quantity:2,retail_amount:2000,ppvz_for_pay:1400,delivery_rub:100},
  {nm_id:1,sa_name:'A',doc_type_name:'Возврат',quantity:1,retail_amount:-1000,ppvz_for_pay:-700,delivery_rub:80,penalty:50}
];const [item]=aggregateReport(rows);assert.equal(item.sold,2);assert.equal(item.returned,1);assert.equal(item.grossSales,1000);assert.equal(item.logistics,180);assert.equal(item.penalties,50)});

test('не создаёт товары из технических строк WB и сохраняет знак корректировок',()=>{const rows=[
  {nm_id:0,barcode:'technical',delivery_rub:100},
  {nm_id:1,barcode:'a',doc_type_name:'Продажа',quantity:1,retail_amount:1000,ppvz_for_pay:700,delivery_rub:100,acquiring_fee:20},
  {nm_id:1,barcode:'a',delivery_rub:-30}
];const result=analyzeReport(rows,{costs:{a:200}});assert.equal(result.products.length,1);assert.equal(result.products[0].logistics,70);assert.equal(result.products[0].acquiring,20);assert.equal(result.products[0].charges,70);assert.equal(result.products[0].netFromWb,630);assert.equal(result.summary.unallocatedCharges,100);assert.equal(result.summary.charges,170);assert.equal(result.summary.profit,330)});

test('не показывает прибыль без себестоимости',()=>{const result=analyzeReport([{nm_id:1,doc_type_name:'Продажа',quantity:1,retail_amount:1000,ppvz_for_pay:700}]);assert.equal(result.products[0].profit,null);assert.equal(result.products[0].severity,'unknown');assert.equal(result.summary.profit,null)});

test('разделяет варианты по баркоду и предпочитает себестоимость баркода',()=>{const rows=[
  {nm_id:1,barcode:'111',doc_type_name:'Продажа',quantity:1,retail_amount:1000,ppvz_for_pay:800},
  {nm_id:1,barcode:'222',doc_type_name:'Продажа',quantity:1,retail_amount:1000,ppvz_for_pay:800}
];const result=analyzeReport(rows,{costs:{1:500,111:300}});assert.equal(result.products.length,2);const first=result.products.find(x=>x.barcode==='111');const second=result.products.find(x=>x.barcode==='222');assert.equal(first.unitCost,300);assert.equal(first.costSource,'barcode');assert.equal(second.unitCost,500);assert.equal(second.costSource,'nmId')});

test('находит убыточный товар и рассчитывает безопасную цену',()=>{const result=analyzeReport([{nm_id:1,doc_type_name:'Продажа',quantity:2,retail_amount:2000,ppvz_for_pay:1200,delivery_rub:200}],{taxPercent:6,targetMargin:15,costs:{1:600}});const item=result.products[0];assert.ok(item.profit<0);assert.equal(item.severity,'loss');assert.ok(item.safePrice>600)});

test('не допускает HTML и числовой мусор в вычисления',()=>{const result=analyzeReport([{nm_id:1,sa_name:'<script>',doc_type_name:'Продажа',quantity:'x',retail_amount:'bad',ppvz_for_pay:Infinity}],{costs:{1:'bad'}});assert.equal(result.summary.grossSales,0);assert.equal(result.products[0].profit,null)});

test('объясняет изменение прибыли между периодами',()=>{const before=analyzeReport([{nm_id:1,barcode:'a',doc_type_name:'Продажа',quantity:1,retail_amount:1000,ppvz_for_pay:800}],{costs:{a:300}});const current=analyzeReport([{nm_id:1,barcode:'a',doc_type_name:'Продажа',quantity:1,retail_amount:1000,ppvz_for_pay:600}],{costs:{a:300}});const comparison=compareAnalyses(current,before);assert.equal(comparison.delta.profit,-200);assert.equal(comparison.drivers[0].nmId,'1')});

test('симулирует цену, проверяет правила и прогнозирует деньги',()=>{const analysis=analyzeReport([{nm_id:1,barcode:'a',doc_type_name:'Продажа',quantity:2,retail_amount:2000,ppvz_for_pay:1200,delivery_rub:300}],{taxPercent:6,costs:{a:500}});const product=analysis.products[0];assert.equal(simulateProduct(product,{priceChangePercent:10}).available,true);assert.ok(evaluateRules(analysis.products,{minMargin:20}).length);const forecast=forecastCashflow(analysis,{days:7,reservePercent:10});assert.equal(forecast.recommendedReserve,90)});

test('показывает покрытие данных и не маскирует неполную прибыль',()=>{const result=analyzeReport([
  {nm_id:1,barcode:'a',doc_type_name:'Продажа',quantity:1,retail_amount:1000,ppvz_for_pay:800},
  {nm_id:2,barcode:'b',doc_type_name:'Продажа',quantity:1,retail_amount:3000,ppvz_for_pay:2400}
],{costs:{a:300}});assert.equal(result.accuracy.status,'partial');assert.equal(result.accuracy.costCoverageProducts,50);assert.equal(result.accuracy.costCoverageSales,25);assert.equal(result.summary.unknownGrossSales,3000);assert.equal(result.actions[0].type,'cost')});

test('сопоставляет рекламу по баркоду раньше nmID и считает экономику единицы',()=>{const result=analyzeReport([{nm_id:1,barcode:'a',doc_type_name:'Продажа',quantity:2,retail_amount:2000,ppvz_for_pay:1600}],{taxPercent:0,costs:{a:300},adCosts:{1:900,a:200}});const item=result.products[0];assert.equal(item.ads,200);assert.equal(item.adSource,'barcode');assert.equal(item.profit,800);assert.equal(item.profitPerUnit,400);assert.equal(item.drr,10)});
test('прогнозирует запас в днях и безопасно обрабатывает отсутствие продаж',()=>{const analysis=analyzeReport([{nm_id:1,barcode:'a',doc_type_name:'Продажа',quantity:14,retail_amount:14000,ppvz_for_pay:10000}],{costs:{a:300}});const result=analyzeInventory([{nmId:'1',barcode:'a',warehouse:'Коледино',quantity:10},{nmId:'1',barcode:'a',warehouse:'Подольск',quantity:0}],analysis.products,7);assert.equal(result[0].daysCover,5);assert.equal(result[0].status,'critical');assert.equal(result[0].reorder,50);assert.equal(result[0].inventoryValue,3000);assert.equal(result[1].status,'out')});
