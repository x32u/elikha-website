export const MODEL_SORTS = {
  newest: 'Newest first', oldest: 'Oldest first',
  largest: 'Largest first', smallest: 'Smallest first',
  az: 'Name: A–Z', za: 'Name: Z–A',
};
export const MODEL_SIZE_FILTERS = {
  all: 'All sizes', small: 'Under 1 MB', medium: '1–10 MB', large: '10 MB and above',
};
export const modelBytes = (model) => {
  const size = Number(model.size);
  return Number.isFinite(size) && size > 0 ? size : null;
};
export const formatModelSize = (model) => {
  const size = modelBytes(model);
  if (size === null) return 'Unknown';
  const unit = size >= 1e9 ? 'GB' : size >= 1e6 ? 'MB' : size >= 1e3 ? 'KB' : 'B';
  const divisor = { GB: 1e9, MB: 1e6, KB: 1e3, B: 1 }[unit];
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(size / divisor)} ${unit}`;
};
export const selectLibraryModels = (models, { query = '', type = 'all', size = 'all', sort = 'newest' } = {}) => {
  const search = query.trim().toLowerCase();
  const result = models.filter((model) => {
    if (search && ![model.label, model.description, model.fileName].some((value) => String(value || '').toLowerCase().includes(search))) return false;
    if (type !== 'all' && String(model.fileType || '').toLowerCase() !== type) return false;
    const bytes = modelBytes(model);
    if (size !== 'all' && bytes === null) return false;
    if (size === 'small' && bytes >= 1e6) return false;
    if (size === 'medium' && (bytes < 1e6 || bytes >= 1e7)) return false;
    if (size === 'large' && bytes < 1e7) return false;
    return true;
  });
  return result.sort((a, b) => {
    const name = String(a.label || '').localeCompare(String(b.label || ''), undefined, { numeric: true, sensitivity: 'base' });
    if (sort === 'az' || sort === 'za') return (sort === 'za' ? -name : name) || String(a.id).localeCompare(String(b.id));
    const bySize = sort === 'largest' || sort === 'smallest';
    const value = (model) => bySize ? modelBytes(model) : (Number.isFinite(Date.parse(model.uploadedAt)) ? Date.parse(model.uploadedAt) : null);
    const left = value(a); const right = value(b);
    // Missing metadata always stays at the end, even for ascending sorts.
    if (left === null || right === null) return left === right ? name : left === null ? 1 : -1;
    return (sort === 'oldest' || sort === 'smallest' ? left - right : right - left) || name;
  });
};
