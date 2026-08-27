/** Reconcile product movement without inventing missing quantities. */
export function reconcileMovement({ shipped=0, accepted=0, sold=0, returned=0, stock=0, inTransit=0, writtenOff=0 }={}) {
  const values={shipped,accepted,sold,returned,stock,inTransit,writtenOff};
  for(const [key,value] of Object.entries(values)) if(!Number.isFinite(Number(value))||Number(value)<0) throw new Error(`Некорректное количество: ${key}`);
  const available=Number(accepted)-Number(sold)+Number(returned)-Number(writtenOff);
  const accounted=Number(stock)+Number(inTransit);
  const gap=Math.round((available-accounted)*100)/100;
  return { ...Object.fromEntries(Object.entries(values).map(([k,v])=>[k,Number(v)])), expectedStock:Math.round(available*100)/100, gap, status:Math.abs(gap)<0.01?'matched':gap>0?'potential-loss':'extra-or-unrecorded' };
}
