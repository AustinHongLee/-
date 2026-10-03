import {computeJoint} from './joint-model.js';
let active=null;
/** Cancel superseded work so typing cannot build a long queue of stale joints. */
export function computeLatestJoint(params){
  if(active){const old=active;active=null;old.worker.terminate();old.reject(new DOMException('已更新尺寸','AbortError'));}
  if(typeof Worker==='undefined')return Promise.resolve(computeJoint(params));
  return new Promise((resolve,reject)=>{
    let worker;try{worker=new Worker(new URL('./geometry-worker.js',import.meta.url),{type:'module'});}catch{resolve(computeJoint(params));return;}
    const request={worker,reject};active=request;
    const finish=()=>{worker.terminate();if(active===request)active=null;};
    worker.onmessage=({data})=>{finish();data.error?reject(new Error(data.error)):resolve(data.result);};
    worker.onerror=()=>{finish();try{resolve(computeJoint(params));}catch(error){reject(error);}};
    worker.postMessage({params});
  });
}
