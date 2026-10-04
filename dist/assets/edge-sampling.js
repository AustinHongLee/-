/** Angular mesh for an isolated port contact on an end-aligned fishmouth.
 * The lateral edge has x ~ sqrt(|theta-contact|). Uniform theta spacing
 * converges poorly there; a fourth-power map gives x ~ u^2 on each side.
 * Angles remain true branch-circle parameters, never station indices.
 */
const TAU = 2 * Math.PI;

export function edgeContactAngles(samples, contactTheta) {
  if (!Number.isInteger(samples) || samples < 4 || samples > 4096)
    throw new RangeError('Edge sampling requires 4 to 4096 integer samples.');
  if (!Number.isFinite(contactTheta))
    throw new RangeError('Edge contact angle must be finite.');
  let contact = contactTheta % TAU;
  if (contact < 0) contact += TAU;
  const half = Math.ceil(samples / 2), angles = new Set([0, contact]);
  // Include the opposite point only once; +/- pi describe the same point.
  for (let i = 1 - half; i <= half; i++) {
    if (i === 0) continue;
    const u = i / half;
    let theta = contact + Math.sign(u) * Math.PI * Math.abs(u) ** 4;
    if (theta < 0) theta += TAU;
    else if (theta >= TAU) theta -= TAU;
    angles.add(theta);
  }
  const ordered = [...angles].sort((a, b) => a - b);
  if (ordered.length > 4096) {
    // Preserve both the conventional 0-degree seam and the true contact.
    // One remote point may be omitted at the maximum supported resolution.
    let remove = -1, farthest = -1;
    ordered.forEach((theta, i) => {
      if (theta === 0 || theta === contact) return;
      const separation = Math.min(Math.abs(theta-contact), TAU-Math.abs(theta-contact));
      if (separation > farthest) { remove = i; farthest = separation; }
    });
    ordered.splice(remove, 1);
  }
  return ordered.concat(TAU);
}
