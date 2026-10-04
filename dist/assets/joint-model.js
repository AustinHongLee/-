/** Dispatch without changing the physical meaning of legacy straight inputs. */
import { DEFAULT_PARAMS as STRAIGHT_DEFAULTS, computeJoint as straightJoint, computeExactStationTable as straightStations } from './geometry.js';
import { computeElbowJoint, computeExactElbowStationTable } from './elbow-geometry.js';
import { computeConicalJoint, computeExactConicalStationTable } from './conical-geometry.js';
export const DEFAULT_PARAMS=Object.freeze({...STRAIGHT_DEFAULTS,hostType:'straight',mainEndOD:219.1,bendRadius:304.8,bendAngle:90,bendPosition:45,surfaceClock:0,branchSwivel:0,elbowAlignment:'free',elbowOffset:0,elbowSideOffset:0,motherOpening:true});
export const computeJoint=params=>params.hostType==='elbow'?computeElbowJoint(params):params.hostType==='cone'?computeConicalJoint(params):straightJoint(params);
export const computeExactStationTable=(result,count)=>result.params.hostType==='elbow'?computeExactElbowStationTable(result,count):result.params.hostType==='cone'?computeExactConicalStationTable(result,count):straightStations(result,count);
