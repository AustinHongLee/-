import {resolveElbowAlignment} from './elbow-axis.js';
import { ASME_PIPE_SIZES } from './pipe-sizes.js';
import { mainAxisSurfaceDatum, jointPositionForSurface } from './field-datums.js';
import { elbowRadiusKind,elbowEntryDimensions,bendPositionFromBack } from './elbow-input.js';

export const pipeSizeByNPS=nps=>ASME_PIPE_SIZES.find(size=>size.nps===nps)??null;
// Never snap an imported or measured diameter to a nearby nominal size.
export const pipeSizeByOD=diameter=>ASME_PIPE_SIZES.find(size=>size.odMm===diameter)??null;
export function setupFromParams(params,saved=null) {
  const datum=params.hostType==='elbow'?null:mainAxisSurfaceDatum(params);
  const setup={mainSize:pipeSizeByOD(params.mainOD)?.nps??'custom',branchSize:pipeSizeByOD(params.branchOD)?.nps??'custom',positionMode:'custom',surfaceDistance:datum?.axialPosition??NaN};
  if(saved&&typeof saved==='object'){
    for(const [key,diameter] of [['mainSize',params.mainOD],['branchSize',params.branchOD]]){
      if(saved[key]==='custom'||pipeSizeByNPS(saved[key])?.odMm===diameter)setup[key]=saved[key];
    }
    // Restore an explicitly saved intent only when it agrees with the actual geometry.
    if(saved.positionMode==='center'&&datum&&Math.abs(datum.axialPosition-params.mainLength/2)<1e-7)setup.positionMode='center';
  }
  if(params.hostType==='elbow'){
    setup.radiusMode=elbowRadiusKind(params,setup.mainSize);
    if(saved?.radiusMode==='custom')setup.radiusMode='custom';
    setup.bendPositionMode=Math.abs(params.bendPosition-params.bendAngle/2)<1e-8?'center':'custom';
    setup.bendBackDistance=elbowEntryDimensions(params).back;
    if(saved?.bendPositionMode==='custom')setup.bendPositionMode='custom';
  }
  return setup;
}
export function positionWithIntent(params,setup) {
  if(params.hostType==='elbow'&&params.elbowAlignment&&params.elbowAlignment!=='free')return resolveElbowAlignment(params);
  if(params.hostType==='elbow')return {...params,bendPosition:setup.bendPositionMode==='center'?params.bendAngle/2:Number.isFinite(setup.bendBackDistance)?bendPositionFromBack(setup.bendBackDistance,params):params.bendPosition};
  const distance=setup.positionMode==='center'?params.mainLength/2:setup.surfaceDistance;
  return {...params,jointPosition:jointPositionForSurface(params,distance)};
}
export function freshInputParams(defaults) {
  const params={...defaults,mainOD:pipeSizeByNPS('8').odMm,branchOD:pipeSizeByNPS('4').odMm};
  return positionWithIntent(params,{positionMode:'center'});
}
