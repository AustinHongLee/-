import { ASME_PIPE_SIZES } from './pipe-sizes.js';
import { mainAxisSurfaceDatum, jointPositionForSurface } from './field-datums.js';

export const pipeSizeByNPS=nps=>ASME_PIPE_SIZES.find(size=>size.nps===nps)??null;
// Never snap an imported or measured diameter to a nearby nominal size.
export const pipeSizeByOD=diameter=>ASME_PIPE_SIZES.find(size=>size.odMm===diameter)??null;
export function setupFromParams(params,saved=null) {
  const datum=mainAxisSurfaceDatum(params);
  const setup={mainSize:pipeSizeByOD(params.mainOD)?.nps??'custom',branchSize:pipeSizeByOD(params.branchOD)?.nps??'custom',positionMode:'custom',surfaceDistance:datum?.axialPosition??NaN};
  if(saved&&typeof saved==='object'){
    for(const [key,diameter] of [['mainSize',params.mainOD],['branchSize',params.branchOD]]){
      if(saved[key]==='custom'||pipeSizeByNPS(saved[key])?.odMm===diameter)setup[key]=saved[key];
    }
    // Restore an explicitly saved intent only when it agrees with the actual geometry.
    if(saved.positionMode==='center'&&datum&&Math.abs(datum.axialPosition-params.mainLength/2)<1e-7)setup.positionMode='center';
  }
  return setup;
}
export function positionWithIntent(params,setup) {
  const distance=setup.positionMode==='center'?params.mainLength/2:setup.surfaceDistance;
  return {...params,jointPosition:jointPositionForSurface(params,distance)};
}
export function freshInputParams(defaults) {
  const params={...defaults,mainOD:pipeSizeByNPS('8').odMm,branchOD:pipeSizeByNPS('4').odMm};
  return positionWithIntent(params,{positionMode:'center'});
}
