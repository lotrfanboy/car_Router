/** Remove only tracking: meaningful query parameters may identify different ads. */
export function canonicalListingUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()])
      if (/^utm_|^(fbclid|gclid|msclkid)$/i.test(key))
        url.searchParams.delete(key);
    url.searchParams.sort();
    return url.toString();
  } catch {
    return value;
  }
}
