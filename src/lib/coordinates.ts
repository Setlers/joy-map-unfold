// Leaflet can report longitudes outside the first world copy. Keep them in
// [-180, 180); privacy rounding is enforced once, by emotions_sanitize in SQL.
export function normalizeLongitude(longitude: number): number {
  if (!Number.isFinite(longitude)) throw new RangeError("Longitude must be finite");
  if (longitude >= -180 && longitude < 180) return longitude === 0 ? 0 : longitude;

  // Decimal arithmetic avoids nudging a halfway value such as -360.45 across
  // the database's rounding boundary through floating-point modulo arithmetic.
  const [coefficient, exponent = "0"] = longitude.toString().split("e");
  const [whole, fraction = ""] = coefficient.split(".");
  const scale = fraction.length - Number(exponent);
  const factor = 10n ** BigInt(Math.max(0, scale));
  const units = BigInt(whole + fraction) * 10n ** BigInt(Math.max(0, -scale));
  const halfWorld = 180n * factor;
  const world = 360n * factor;
  const wrapped = ((((units + halfWorld) % world) + world) % world) - halfWorld;
  return Number(wrapped) / Number(factor);
}
