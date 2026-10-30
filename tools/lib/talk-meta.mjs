// Shared metadata helpers for the talk inventory: dates, venues, titles, slugs.

const STATES = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT',
  Delaware: 'DE', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI',
  Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC',
  'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI',
  'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT',
  Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
};
const STATE_ABBR = Object.fromEntries(Object.entries(STATES).map(([n, a]) => [a, n]));
// Folder abbreviations that are states only in this corpus.
const FOLDER_STATE_ABBR = { NH: 'New Hampshire', NM: 'New Mexico', RI: 'Rhode Island', MA: 'Massachusetts', IL: 'Illinois', IN: 'Indiana', MN: 'Minnesota' };

// Conferences and professional meetings: folder token → [display name, type].
const VENUES = [
  [/^NCME$/i, 'NCME Annual Meeting', 'conference'],
  [/^AERA$/i, 'AERA Annual Meeting', 'conference'],
  [/^NCSA(_CCSSO)?(_\d{4})?$|^CCSSO_NCSA$/i, 'CCSSO National Conference on Student Assessment', 'conference'],
  [/^CCSSO$/i, 'CCSSO', 'conference'],
  [/^CCSSO_SCASS$|^ASR_SCASS/i, 'CCSSO SCASS', 'conference'],
  [/^CCSSO_Assessment_Directors/i, 'CCSSO Assessment Directors Meeting', 'conference'],
  [/^NERA$/i, 'Northeastern Educational Research Association', 'conference'],
  [/^NEERO$/i, 'Northeastern Educational Research Organization', 'conference'],
  [/^WERA/i, 'Washington Educational Research Association', 'conference'],
  [/^FERA$/i, 'Florida Educational Research Association', 'conference'],
  [/^MERA$/i, 'Massachusetts Educational Research Association', 'conference'],
  [/^MARCES$/i, 'MARCES Conference', 'conference'],
  [/^IAEA$/i, 'International Association for Educational Assessment', 'conference'],
  [/^AASA$/i, 'AASA', 'conference'],
  [/^NJASA$/i, 'NJASA', 'conference'],
  [/^TILSA$/i, 'CCSSO TILSA', 'conference'],
  [/^Strata$/i, 'Strata Conference', 'conference'],
  [/^Big_Data$/i, 'Big Data Meeting', 'conference'],
  [/^Web_2\.0$/i, 'Web 2.0 Expo', 'conference'],
  [/^Gov_2\.0$/i, 'Gov 2.0 Expo', 'conference'],
  [/^Reporting_Symposium$/i, 'Reporting Symposium', 'conference'],
  [/^EdFirst/i, 'EdFirst Conference', 'conference'],
  [/^AIME/i, 'AIME-Con', 'conference'],
  [/^DQC$/i, 'Data Quality Campaign', 'invited'],
  [/^RILS/i, 'Center for Assessment Reidy Interactive Lecture Series', 'colloquium'],
  [/^RLI/i, 'Center for Assessment RLI', 'colloquium'],
  [/^Colloquium/i, 'Center for Assessment Colloquium', 'colloquium'],
  [/Staff_(Meeting|Sharing)|_Staff_Meeting$|Staff_Meeting_Flash/i, 'Center for Assessment staff meeting', 'staff'],
  [/^Assemblage/i, 'Assemblage', 'invited'],
  [/Seminar|UCONN_Colloquium|UMASS|Boston_College|BC_Russell|Harvard|UPENN|CUReminar/i, null, 'academic'],
  [/^(ETS|College_Board|Metametrics|Renaissance|Pearson|PCG|ERB|Walton|Choice_Solutions|CNA|PARCC|SBAC|New_Meridian|IES|NAGB|REL_|Hawaii_REL|ARCC|Great_Teachers|Governors_Council|Archdiocese|Baltimore_Archdiocese|Michigan_Center_for_Charter|Washoe|Albuquerque|Special_Education|China|Automated_Reporting|Growth_Literacy|MA_DESE|DoWEA)/i, null, 'invited'],
];

export function parseDateToken(s) {
  if (!s) return null;
  // 5.6.2021 or 5.6.21
  let m = s.match(/(?:^|[^\d])(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})(?=[^\d]|$)/);
  if (m) return iso(m[3], m[1], m[2]);
  // MMDDYYYY
  m = s.match(/(?:^|[^\d])(\d{2})(\d{2})(20\d{2})(?=[^\d]|$)/);
  if (m) { const d = iso(m[3], m[1], m[2]); if (d) return d; }
  // MMDDYY
  const re = /(?:^|[^\d])(\d{2})(\d{2})(\d{2})(?=[^\d]|$)/g;
  while ((m = re.exec(s))) { const d = iso(m[3], m[1], m[2]); if (d) return d; }
  return null;
}

function iso(y, mo, d) {
  let year = Number(y);
  if (year < 100) year += 2000;
  const month = Number(mo);
  const day = Number(d);
  if (year < 2004 || year > 2027 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function stateFrom(folder) {
  const words = folder.replace(/[_-]+/g, ' ');
  for (const name of Object.keys(STATES).sort((a, b) => b.length - a.length)) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(words)) return name;
  }
  const first = folder.split(/[_\s-]/)[0];
  if (FOLDER_STATE_ABBR[first]) return FOLDER_STATE_ABBR[first];
  if (/^IL$/.test(first)) return 'Illinois';
  return null;
}

export function classifyVenue(folder, relDir = '') {
  for (const [re, name, type] of VENUES) {
    if (re.test(folder)) return { name: name || prettify(folder), type, short: shortVenue(folder) };
  }
  const state = stateFrom(folder);
  if (state) {
    const isTac = /TAC/i.test(folder) || /TAC/i.test(relDir);
    return {
      name: `${state}${isTac ? ' Technical Advisory Committee' : ' Department of Education'}`,
      type: isTac ? 'tac' : 'state',
      state,
      short: `${STATES[state] || state}${isTac ? '-tac' : ''}`,
    };
  }
  if (/TAC/i.test(folder)) return { name: prettify(folder), type: 'tac', short: shortVenue(folder) };
  return { name: prettify(folder), type: 'invited', short: shortVenue(folder) };
}

function shortVenue(folder) {
  return folder.replace(/_?\d{6}$/, '').split(/[_\s]/).slice(0, 2).join('-');
}

export function prettify(s) {
  return s
    .replace(/_?\d{6}(\d{2})?(?=$|_)/g, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const AUTHOR_TOKENS = /\b(betebenner|damian|db|vaniwaarden|depascale|dwb)\b/gi;
const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'vs', 'with']);

export function titleFromStem(stem) {
  if (!stem) return '';
  let s = stem
    .replace(/\(\d+\)/g, ' ')
    .replace(/\d{1,2}\.\d{1,2}\.\d{2,4}/g, ' ')
    .replace(/(^|[^\d])\d{6}(\d{2})?(?=[^\d]|$)/g, '$1 ')
    .replace(/\b(final|draft|copy|v\d+|sm)\b/gi, ' ')
    .replace(AUTHOR_TOKENS, ' ')
    .replace(/[_]+/g, ' ')
    .replace(/\s*-\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  // Split run-together lowercase words only where camelCase marks a boundary.
  s = s.replace(/([a-z])([A-Z][a-z])/g, '$1 $2');
  return s
    .split(' ')
    .map((w, i) => {
      if (/^[A-Z0-9&.-]{2,}$/.test(w)) return w; // acronyms
      const lw = w.toLowerCase();
      if (i > 0 && SMALL.has(lw)) return lw;
      return lw.charAt(0).toUpperCase() + lw.slice(1);
    })
    .join(' ');
}

export function slugify(s) {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export { STATES, STATE_ABBR };
