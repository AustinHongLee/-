// Shared line icons for the offset workbench. Decorative; the button keeps its text label.
const paths={
  route:'M4 17h4a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3h6M4 14v6m16-17v6',
  layers:'m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  measure:'M5 3v18h15M8 6H5m3 4H5m3 4H5m3 4H5m7 3v-3m4 3v-3',
  settings:'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6M9 15v6',
  play:'m9 5 10 7-10 7V5Z',pause:'M8 5v14M16 5v14',
  reset:'M4 9V4m0 0h5M4 4l4 4a7 7 0 1 1-2 8',
  arrow:'M4 12h15m-6-6 6 6-6 6',check:'m5 12 4 4L19 6',
  chevron:'m9 5 7 7-7 7',plus:'M12 5v14M5 12h14',minus:'M5 12h14',
  box:'m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 10v9M3 8l9 5 9-5M8 5l9 5',
  rotate:'M20 10a8 8 0 1 0-1 7M20 4v6h-6',
  document:'M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8m-8 4h6',
  move:'M12 3v18M3 12h18m-12-6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3',
  info:'M12 11v6m0-10v.1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'
};
export const uiIcon=(name)=>`<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]??paths.info}"/></svg>`;
export const assemblyModeSVG=mode=>`<svg class="assembly-mode-art" viewBox="0 0 200 95" aria-hidden="true"><path d="M12 81H190" stroke="#dce8e8" stroke-width="1" stroke-dasharray="3 5"/><path d="M14 62h39q10 0 18-7l45-33q8-6 18-6h51" fill="none" stroke="#426a77" stroke-width="16" stroke-linecap="butt"/><path d="M14 62h39q10 0 18-7l45-33q8-6 18-6h51" fill="none" stroke="#b9d0d6" stroke-width="12"/><path d="M62 61 71 54M116 22l7-5" stroke="#497a87" stroke-width="2"/>${mode==='last'?'<path d="m77 50 33-24" stroke="#f6faf9" stroke-width="20"/><path d="m77 50 33-24" stroke="#3c9c98" stroke-width="12"/><path d="M94 85V63m-5 5 5-5 5 5" fill="none" stroke="#b28545" stroke-width="2" stroke-linecap="round"/>':'<path d="M94 86V67m-5 5 5-5 5 5" fill="none" stroke="#b28545" stroke-width="2" stroke-linecap="round"/>'}<ellipse cx="14" cy="62" rx="2" ry="6" fill="#eff7f7" stroke="#426a77"/><ellipse cx="185" cy="16" rx="2" ry="6" fill="#eff7f7" stroke="#426a77"/></svg>`;
