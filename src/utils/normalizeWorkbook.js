// ExcelJS expects unprefixed SpreadsheetML tags. Normalize element names,
// not cell contents, for valid XLSX files produced by other writers.
export async function normalizeWorkbook(buffer) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buffer);
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  let changed = false;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !/^xl\/.*\.xml$/.test(entry.name)) continue;
    const doc = new DOMParser().parseFromString(await entry.async('string'), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Invalid workbook XML.');
    let modified = false;
    for (const element of Array.from(doc.getElementsByTagNameNS(ns, '*'))) {
      if (!element.prefix) continue;
      const replacement = doc.createElementNS(ns, element.localName);
      for (const attr of Array.from(element.attributes)) {
        if (attr.namespaceURI === 'http://www.w3.org/2000/xmlns/' && attr.value === ns) continue;
        replacement.setAttributeNS(attr.namespaceURI, attr.name, attr.value);
      }
      while (element.firstChild) replacement.appendChild(element.firstChild);
      element.parentNode.replaceChild(replacement, element);
      modified = true;
    }
    if (modified) { zip.file(entry.name, new XMLSerializer().serializeToString(doc)); changed = true; }
  }
  return changed ? zip.generateAsync({ type: 'arraybuffer' }) : buffer;
}
