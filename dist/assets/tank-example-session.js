// A practice project belongs to this tab. The user's ordinary draft is never
// used as the example's autosave destination, even after a page reload.
export function createTankExampleSession(storage,key){
  let state=null;
  try{const raw=storage.getItem(key);if(raw){const parsed=JSON.parse(raw);if(parsed?.version===1&&isInput(parsed.original?.input)&&isInput(parsed.working))state=parsed;}}catch{}
  function isInput(value){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.hasOwn(value,'diameter')&&Object.hasOwn(value,'height');}
  function save(next){storage.setItem(key,JSON.stringify(next));state=next;}
  return {
    get active(){return !!state;},
    get working(){return state?structuredClone(state.working):null;},
    start(input,working,ui={}){
      if(state)return false;
      if(!isInput(input)||!isInput(working))throw new Error('範本或原專案資料不完整。');
      save({version:1,original:{input:structuredClone(input),ui:structuredClone(ui)},working:structuredClone(working)});return true;
    },
    update(input){if(state)save({...state,working:structuredClone(input)});},
    original(){return state?structuredClone(state.original):null;},
    finish(){storage.removeItem(key);state=null;}
  };
}
