import {esc,fmt} from './offset-exports.js';
import {COMPONENT_NAMES,CONNECTION_NAMES,componentTargetLabel} from './offset-components.js';
export const partName=e=>e.type==='pipe'?'直管':e.type==='component'?(e.name||COMPONENT_NAMES[e.kind]):'彎頭';
export function componentIcon(kind='valve'){
  return `<svg viewBox="0 0 100 62" aria-hidden="true"><path d="M6 40h88" stroke="currentColor" stroke-width="10"/><path d="M23 27v26M77 27v26" stroke="currentColor" stroke-width="5"/>${kind==='flangePair'?'<path d="M45 21v37M55 21v37" stroke="currentColor" stroke-width="6"/>':kind==='valve'?'<path d="M30 28l20 12-20 12zM70 28L50 40l20 12z" fill="currentColor"/><path d="M50 31V12M34 12h32" stroke="currentColor" stroke-width="4"/>':'<rect x="32" y="27" width="36" height="26" rx="4" fill="currentColor"/>'}</svg>`;
}
export function componentFabricationSVG(e){
  const icon=componentIcon(e.kind).replace('viewBox="0 0 100 62"','x="260" y="38" width="160" height="110"');
  return `<svg viewBox="0 0 680 240" role="img" aria-label="${esc(partName(e))}，組立總長 ${fmt(e.length)} 毫米"><g font-family="Arial,Microsoft JhengHei" fill="#27465e" color="#bb8136"><path d="M110 105h140M430 105h140" stroke="#91a9b8" stroke-width="18"/>${icon}<path d="M250 160h180M250 151v18M430 151v18" stroke="#bb8136"/><text x="340" y="195" text-anchor="middle" font-size="20">組立總長 ${fmt(e.length)} mm</text><text x="130" y="60" text-anchor="middle" font-size="14">A 側 ${esc(CONNECTION_NAMES[e.leftConnection])}</text><text x="130" y="148" text-anchor="middle" font-size="13">預留 ${fmt(e.leftGap)} mm</text><text x="550" y="60" text-anchor="middle" font-size="14">B 側 ${esc(CONNECTION_NAMES[e.rightConnection])}</text><text x="550" y="148" text-anchor="middle" font-size="13">預留 ${fmt(e.rightGap)} mm</text><text x="340" y="226" text-anchor="middle" font-size="12" fill="#71889b">${esc(componentTargetLabel(e.target))} · 外形為辨識示意，依實物組立總長</text></g></svg>`;
}
