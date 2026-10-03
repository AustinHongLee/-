/** Manufacturer tabulated 90° A dimensions, used as nominal ideal Rc.
 * Benkan Pipe Fittings Catalogue PDF p8. These are not measured curvature.
 * 45° B is centre-to-end, not Rc: never infer a 45° radius from this table.
 */
export const ELBOW_RADIUS_REFERENCE='https://www.benkankikoh.com/en/wp-content/uploads/2016/07/PipeFittings-Catalogue.pdf';
export const ELBOW_RADII=Object.freeze({
 '1/2':[38.1,null],'3/4':[38.1,null],'1':[38.1,25.4],'1-1/4':[47.8,31.8],'1-1/2':[57.2,38.1],
 '2':[76.2,50.8],'2-1/2':[95.3,63.5],'3':[114.3,76.2],'3-1/2':[133.4,88.9],'4':[152.4,101.6],
 '5':[190.5,127],'6':[228.6,152.4],'8':[304.8,203.2],'10':[381,254],'12':[457.2,304.8],
 '14':[533.4,355.6],'16':[609.6,406.4],'18':[685.8,457.2],'20':[762,508],'22':[838.2,558.8],'24':[914.4,609.6]
});
export function nominalElbowRadius(nps,kind,bendAngle=90){return bendAngle===90&&['lr','sr'].includes(kind)?ELBOW_RADII[nps]?.[kind==='lr'?0:1]??null:null;}
export function elbowRadiusKind(p,nps){return ['lr','sr'].find(kind=>nominalElbowRadius(nps,kind,p.bendAngle)===p.bendRadius)??'custom';}
export const bendPositionFromBack=(distance,p)=>distance/(p.bendRadius+p.mainOD/2)*180/Math.PI;
export function elbowEntryDimensions(p){const b=p.bendPosition*Math.PI/180,phi=p.surfaceClock*Math.PI/180,r=p.mainOD/2;return {back:(p.bendRadius+r)*b,belly:(p.bendRadius-r)*b,around:r*((phi%(2*Math.PI)+2*Math.PI)%(2*Math.PI))};}
