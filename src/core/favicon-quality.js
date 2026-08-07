const MIN_RASTER_FAVICON_SIZE = 48;

function isVectorFaviconUrl(url) {
  try {
    return new URL(String(url || "")).pathname.toLowerCase().endsWith(".svg");
  } catch {
    return false;
  }
}

function isFaviconCandidateAcceptable(candidate, naturalWidth, naturalHeight) {
  const width = Number(naturalWidth) || 0;
  const height = Number(naturalHeight) || 0;
  if (width <= 0 || height <= 0) return false;
  if (isVectorFaviconUrl(candidate?.url)) return true;

  const sourceKind = String(candidate?.sourceKind || candidate?.kind || "");
  if (sourceKind === "chrome") return true;
  return Math.min(width, height) >= MIN_RASTER_FAVICON_SIZE;
}

export {
  MIN_RASTER_FAVICON_SIZE,
  isFaviconCandidateAcceptable,
  isVectorFaviconUrl,
};
