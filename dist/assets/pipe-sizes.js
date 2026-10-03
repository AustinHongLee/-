// Outside-diameter lookup only. Selecting a nominal size does not establish
// material, wall schedule, fittings compatibility, pressure rating, or compliance.
// Verified 2026-10-03 (Asia/Taipei) against manufacturer-hosted references.
// Keep ASME's tabulated SI diameters for NPS 10 and 12: 273.0 and 323.8 mm.
export const ASME_PIPE_SIZES = [
  { nps: '1/8', nominalInches: 0.125, dn: 6, odMm: 10.3 },
  { nps: '1/4', nominalInches: 0.25, dn: 8, odMm: 13.7 },
  { nps: '3/8', nominalInches: 0.375, dn: 10, odMm: 17.1 },
  { nps: '1/2', nominalInches: 0.5, dn: 15, odMm: 21.3 },
  { nps: '3/4', nominalInches: 0.75, dn: 20, odMm: 26.7 },
  { nps: '1', nominalInches: 1, dn: 25, odMm: 33.4 },
  { nps: '1-1/4', nominalInches: 1.25, dn: 32, odMm: 42.2 },
  { nps: '1-1/2', nominalInches: 1.5, dn: 40, odMm: 48.3 },
  { nps: '2', nominalInches: 2, dn: 50, odMm: 60.3 },
  { nps: '2-1/2', nominalInches: 2.5, dn: 65, odMm: 73.0 },
  { nps: '3', nominalInches: 3, dn: 80, odMm: 88.9 },
  { nps: '3-1/2', nominalInches: 3.5, dn: 90, odMm: 101.6 },
  { nps: '4', nominalInches: 4, dn: 100, odMm: 114.3 },
  { nps: '5', nominalInches: 5, dn: 125, odMm: 141.3 },
  { nps: '6', nominalInches: 6, dn: 150, odMm: 168.3 },
  { nps: '8', nominalInches: 8, dn: 200, odMm: 219.1 },
  { nps: '10', nominalInches: 10, dn: 250, odMm: 273.0 },
  { nps: '12', nominalInches: 12, dn: 300, odMm: 323.8 },
  { nps: '14', nominalInches: 14, dn: 350, odMm: 355.6 },
  { nps: '16', nominalInches: 16, dn: 400, odMm: 406.4 },
  { nps: '18', nominalInches: 18, dn: 450, odMm: 457.2 },
  { nps: '20', nominalInches: 20, dn: 500, odMm: 508.0 },
  { nps: '22', nominalInches: 22, dn: 550, odMm: 558.8 },
  { nps: '24', nominalInches: 24, dn: 600, odMm: 609.6 }
];
export const ASME_PIPE_SIZE_REFERENCES = [
  {
    title: 'Benkan Kikoh Pipe Fittings Catalogue: Pipe Dimension Reference / Wall Thickness Schedules (ASME)',
    url: 'https://www.benkankikoh.com/en/wp-content/uploads/2016/07/PipeFittings-Catalogue.pdf',
    pdfPage: 5,
    covers: 'NPS 1/4 through 24: tabulated OD in mm; ASME B36.10 and B36.19 headings',
    retrievedOn: '2026-10-03'
  },
  {
    title: 'Rexal Tubes: ASME B36.10 Pipe Dimensions',
    url: 'https://www.rexaltubes.com/asme-b36-10-pipe-dimensions.pdf',
    pdfPage: 3,
    covers: 'NPS 1/8 OD 10.3 mm (do not use mixed-rounding later rows in this document)',
    retrievedOn: '2026-10-03'
  },
  {
    title: 'ASME: Welded and Seamless Wrought Steel Pipe standard scope',
    url: 'https://www.asme.org/codes-standards/find-codes-standards/b36-10m-welded-seamless-wrought-steel-pipe',
    covers: 'Standard scope and distinction between pipe nominal sizes and outside diameter',
    retrievedOn: '2026-10-03'
  }
];
