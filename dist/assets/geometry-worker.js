import {computeJoint} from './joint-model.js';
self.onmessage=({data})=>{try{self.postMessage({result:computeJoint(data.params)});}catch(error){self.postMessage({error:error.message});}};
