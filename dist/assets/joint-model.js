/** Dispatch without changing the physical meaning of legacy straight inputs. */
import { DEFAULT_PARAMS as STRAIGHT_DEFAULTS, computeJoint as straightJoint, computeExactStationTable as straightStations } from './geometry.js';
import { computeElbowJoint, computeExactElbowStationTable } from './elbow-geometry.js';
export const DEFAULT_PARAMS=Object.freeze({...STRAIGHT_DEFAULTS,hostType:'straight',bendRadius:304.8,bendAngle:90,bendPosition:45,surfaceClock:0,branchSwivel:0});
export const computeJoint=params=>params.hostType==='elbow'?computeElbowJoint(params):straightJoint(params);
export const computeExactStationTable=(result,count)=>result.params.hostType==='elbow'?computeExactElbowStationTable(result,count):straightStations(result,count);
