export async function geocodePostcode(postcode: string): Promise<{ lat: number; lon: number }> {
  const pc = postcode.trim();
  const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
  if (!res.ok) throw new Error("Invalid postcode");
  const data = await res.json();
  if (!data?.result) throw new Error("Invalid postcode");
  return { lat: data.result.latitude, lon: data.result.longitude };
}