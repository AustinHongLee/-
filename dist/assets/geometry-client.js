import {computeJoint} from './joint-model.js';
let active=null,cached=null;

// JSON.stringify alone aliases NaN/Infinity with null and drops undefined keys.
// Preserve exact parameter values while making object property order irrelevant.
function parameterKey(value,ancestors=new Set()){
  if(value===null)return 'null';
  if(typeof value==='number')return `number:${Object.is(value,-0)?'-0':String(value)}`;
  if(typeof value==='string')return `string:${JSON.stringify(value)}`;
  if(typeof value==='boolean')return `boolean:${value}`;
  if(value===undefined)return 'undefined';
  if(typeof value==='bigint')return `bigint:${value}`;
  if(typeof value!=='object')throw new TypeError('尺寸參數格式不正確。');
  if(ancestors.has(value))throw new TypeError('尺寸參數不能循環參照。');
  ancestors.add(value);
  const key=Array.isArray(value)?`array:[${Array.from({length:value.length},(_,i)=>Object.hasOwn(value,i)?parameterKey(value[i],ancestors):'hole').join(',')}]`:
    `object:{${Object.keys(value).sort().map(name=>`${JSON.stringify(name)}:${parameterKey(value[name],ancestors)}`).join(',')}}`;
  ancestors.delete(value);return key;
}

const consume=promise=>promise.then(result=>structuredClone(result));

/** Cancel superseded work, share identical in-flight work, and retain one valid
 * result. Every consumer receives an independent clone: the app adds drawing
 * templates and field references, so neither a shared result nor the cached
 * geometry may ever be exposed directly to it.
 */
export function computeLatestJoint(params){
  let snapshot,key;
  try{snapshot=structuredClone(params);key=parameterKey(snapshot);}catch(error){if(active)active.cancel();return Promise.reject(error);}
  if(active?.key===key)return consume(active.promise);
  if(active)active.cancel();
  // A cached request is still the latest request: it must cancel a different
  // running worker before returning the already verified geometry.
  if(cached?.key===key)return consume(Promise.resolve(cached.result));

  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const request={key,promise,worker:null,settled:false,cancel:null};
  active=request;
  const stop=()=>{request.worker?.terminate();if(active===request)active=null;};
  const fail=error=>{if(request.settled)return;request.settled=true;stop();reject(error);};
  const finish=result=>{
    if(request.settled)return;
    let stored;try{stored=structuredClone(result);}catch(error){fail(error);return;}
    request.settled=true;stop();
    if(stored?.valid===true)cached={key,result:stored};
    resolve(stored);
  };
  request.cancel=()=>fail(new DOMException('已更新尺寸','AbortError'));
  const fallback=()=>{if(request.settled)return;request.worker?.terminate();try{finish(computeJoint(snapshot));}catch(error){fail(error);}};

  if(typeof Worker==='undefined'){fallback();return consume(promise);}
  try{request.worker=new Worker(new URL('./geometry-worker.js',import.meta.url),{type:'module'});}catch{fallback();return consume(promise);}
  request.worker.onmessage=({data})=>{
    if(request.settled)return;
    data.error?fail(new Error(data.error)):finish(data.result);
  };
  request.worker.onerror=fallback;
  try{request.worker.postMessage({params:snapshot});}catch{fallback();}
  return consume(promise);
}
