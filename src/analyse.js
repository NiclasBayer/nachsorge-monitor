// ---------------------------------------------------------------------------
//  Auswertung im Browser — keine Daten verlassen den Rechner.
//  Logik 1:1 aus dem ursprünglichen Express-Backend übernommen.
// ---------------------------------------------------------------------------

// Karenzzeit (Tage), bevor ein ueberschrittener Abstand als Vorfall zaehlt.
export const TOLERANZ_TAGE = 7;
const TAG = 86400000;

// ---------------------------------------------------------------------------
//  CSV-Parsing (robust gegen unterschiedliche Spaltennamen / Trennzeichen)
// ---------------------------------------------------------------------------
function normHeader(h) {
  return String(h).toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

const SPALTEN = {
  patient_id: ['patientenid', 'patientid', 'patid', 'patnr', 'patientennummer', 'id'],
  name: ['name', 'patient', 'patientname', 'patientenname'],
  auge: ['auge', 'seite', 'eye', 'augenseite', 'odos', 'lateralitaet'],
  datum: ['behandlungsdatum', 'datum', 'date', 'termin', 'termindatum'],
  diagnose: ['diagnose', 'diagnosis', 'befund'],
  behandlung: ['behandlung', 'artderbehandlung', 'behandlungsart', 'therapie', 'leistung', 'massnahme'],
  abstand: ['sollabstandwochen', 'sollabstand', 'abstandwochen', 'intervallwochen', 'intervall', 'abstand', 'wochen'],
};

function mapHeaders(headerCells) {
  const norm = headerCells.map(normHeader);
  const idx = {};
  for (const [key, aliases] of Object.entries(SPALTEN)) {
    idx[key] = norm.findIndex((h) => aliases.includes(h));
  }
  return idx;
}

// Auge auf 'R' / 'L' normalisieren (oder '' wenn nicht angegeben)
function normAuge(v) {
  const s = String(v || '').toLowerCase().replace(/[^a-zäöü]/g, '');
  if (['rechts', 'rechtesauge', 'r', 're', 'od', 'oculusdexter', 'right'].includes(s)) return 'R';
  if (['links', 'linkesauge', 'l', 'li', 'os', 'oculussinister', 'left'].includes(s)) return 'L';
  return '';
}

function augeLabel(a) {
  return a === 'R' ? 'Rechtes Auge' : a === 'L' ? 'Linkes Auge' : '';
}

function detectDelim(line) {
  const semi = (line.match(/;/g) || []).length;
  const comma = (line.match(/,/g) || []).length;
  const tab = (line.match(/\t/g) || []).length;
  if (tab >= semi && tab >= comma) return '\t';
  return semi >= comma ? ';' : ',';
}

function splitLine(line, delim) {
  return line.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''));
}

function parseDate(s) {
  if (!s) return null;
  const t = String(s).trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); // YYYY-MM-DD
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); // DD.MM.YYYY
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // MM/DD/YYYY (Fallback)
  if (m) return Date.UTC(+m[3], +m[1] - 1, +m[2]);
  return null;
}

function fmtDate(ms) {
  if (ms == null) return '';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

function parseCsv(text) {
  const clean = String(text).replace(/^﻿/, '').replace(/\r/g, '');
  const lines = clean.split('\n').filter((l) => l.trim().length);
  if (lines.length < 2) throw new Error('Die CSV enthält keine auswertbaren Datenzeilen.');

  const delim = detectDelim(lines[0]);
  const header = splitLine(lines[0], delim);
  const idx = mapHeaders(header);

  const fehlend = ['patient_id', 'datum', 'abstand'].filter((k) => idx[k] < 0);
  if (fehlend.length) {
    const namen = { patient_id: 'Patienten-ID', datum: 'Behandlungsdatum', abstand: 'Soll-Abstand (Wochen)' };
    throw new Error('Folgende Pflichtspalten wurden nicht gefunden: ' + fehlend.map((k) => namen[k]).join(', ') + '.');
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i], delim);
    const get = (k) => (idx[k] >= 0 ? (cells[idx[k]] ?? '') : '');
    const abstand = parseFloat(String(get('abstand')).replace(',', '.'));
    rows.push({
      patient_id: get('patient_id') || `Zeile ${i + 1}`,
      name: get('name'),
      auge: normAuge(get('auge')),
      diagnose: get('diagnose'),
      behandlung: get('behandlung'),
      datumMs: parseDate(get('datum')),
      abstandWochen: isFinite(abstand) && abstand > 0 ? abstand : null,
      zeile: i + 1,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
//  Auswertung — je AUGE getrennt: ein Patient = bis zu zwei Verlaeufe (R/L),
//  jeder mit eigenem Intervall, eigener Faelligkeit und eigener Warnung.
// ---------------------------------------------------------------------------
function heuteUtc() {
  const n = new Date();
  return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
}

function analysiere(rows, stichtagMs) {
  const heute = stichtagMs;

  // Gruppierung nach Patient + Auge
  const byUnit = new Map();
  for (const r of rows) {
    const key = `${r.patient_id}||${r.auge}`;
    if (!byUnit.has(key)) byUnit.set(key, []);
    byUnit.get(key).push(r);
  }

  const verlaeufe = [];
  for (const [, list] of byUnit) {
    const beh = list.filter((r) => r.datumMs != null).sort((a, b) => a.datumMs - b.datumMs);
    const ungueltig = list.length - beh.length;
    const letzte = beh[beh.length - 1];
    const erste = list[0] || {};
    const name = (list.find((r) => r.name) || {}).name || '';
    const auge = erste.auge || '';
    const vorfaelle = [];

    // 1) Historische Intervalle zwischen aufeinanderfolgenden Behandlungen DIESES Auges
    for (let i = 0; i < beh.length - 1; i++) {
      const a = beh[i];
      const b = beh[i + 1];
      if (a.abstandWochen == null) continue;
      const sollTage = Math.round(a.abstandWochen * 7);
      const istTage = Math.round((b.datumMs - a.datumMs) / TAG);
      if (istTage > sollTage + TOLERANZ_TAGE) {
        vorfaelle.push({
          typ: 'verspaetet',
          von: fmtDate(a.datumMs),
          bis: fmtDate(b.datumMs),
          sollTage,
          istTage,
          ueberzugTage: istTage - sollTage,
        });
      }
    }

    // 2) Aktueller Status: ist der naechste Folgetermin fuer dieses Auge ueberfaellig?
    let status = 'ok';
    let faelligMs = null;
    let tageUeberfaellig = 0;
    let tageBisFaellig = null;

    if (letzte && letzte.abstandWochen != null) {
      faelligMs = letzte.datumMs + Math.round(letzte.abstandWochen * 7) * TAG;
      const diff = Math.round((heute - faelligMs) / TAG);
      if (diff > TOLERANZ_TAGE) {
        status = 'ueberfaellig';
        tageUeberfaellig = diff;
      } else {
        tageBisFaellig = -diff;
      }
    }
    if (status !== 'ueberfaellig' && vorfaelle.length > 0) status = 'verspaetet';

    verlaeufe.push({
      patient_id: erste.patient_id,
      name,
      auge,
      augeLabel: augeLabel(auge),
      diagnose: letzte ? letzte.diagnose : erste.diagnose || '',
      behandlung: letzte ? letzte.behandlung : '',
      anzahlBehandlungen: beh.length,
      letzteBehandlung: letzte ? fmtDate(letzte.datumMs) : '',
      sollAbstandWochen: letzte ? letzte.abstandWochen : null,
      faelligAm: faelligMs != null ? fmtDate(faelligMs) : '',
      tageUeberfaellig,
      tageBisFaellig,
      status,
      vorfaelle,
      hinweise: ungueltig > 0 ? [`${ungueltig} Zeile(n) ohne gültiges Datum übersprungen`] : [],
    });
  }

  const rang = { ueberfaellig: 0, verspaetet: 1, ok: 2 };
  verlaeufe.sort(
    (a, b) =>
      rang[a.status] - rang[b.status] ||
      b.tageUeberfaellig - a.tageUeberfaellig ||
      String(a.patient_id).localeCompare(String(b.patient_id)) ||
      a.auge.localeCompare(b.auge)
  );

  const meta = {
    stichtag: fmtDate(heute),
    patienten: new Set(rows.map((r) => r.patient_id)).size,
    augen: verlaeufe.length,
    behandlungen: rows.length,
    ueberfaellig: verlaeufe.filter((p) => p.status === 'ueberfaellig').length,
    verspaetet: verlaeufe.filter((p) => p.status === 'verspaetet').length,
    ok: verlaeufe.filter((p) => p.status === 'ok').length,
    toleranzTage: TOLERANZ_TAGE,
  };
  return { meta, verlaeufe };
}

// Der Beispiel-Datensatz wurde für den Stichtag 18.06.2026 gebaut. Damit die gemischten
// Fälle (überfällig / verspätet / im Plan) auch später sichtbar bleiben, werden alle
// Datumswerte um den Abstand zwischen diesem Stichtag und heute verschoben.
const DEMO_STICHTAG = Date.UTC(2026, 5, 18);

export function verschiebeDemoDaten(csv) {
  const offset = heuteUtc() - DEMO_STICHTAG;
  return csv.replace(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g, (_, d, m, y) =>
    fmtDate(Date.UTC(+y, +m - 1, +d) + offset)
  );
}

export function werteAus(csv) {
  if (typeof csv !== 'string' || csv.trim().length < 5) {
    throw new Error('Es wurden keine CSV-Daten gefunden.');
  }
  return analysiere(parseCsv(csv), heuteUtc());
}

// ---------------------------------------------------------------------------
//  Report der auffaelligen Augen-Verlaeufe als CSV
// ---------------------------------------------------------------------------
function csvCell(v) {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function reportCsv(result) {
  const flagged = result.verlaeufe.filter((p) => p.status !== 'ok');
  const head = [
    'Patienten-ID', 'Name', 'Auge', 'Status', 'Diagnose', 'Letzte Behandlung',
    'Soll-Abstand (Wochen)', 'Folgetermin faellig am', 'Tage ueberfaellig', 'Anzahl Vorfaelle',
  ];
  const lines = [head.join(';')];
  for (const p of flagged) {
    lines.push([
      p.patient_id,
      p.name,
      p.auge === 'R' ? 'Rechts' : p.auge === 'L' ? 'Links' : '',
      p.status === 'ueberfaellig' ? 'Ueberfaellig' : 'Verspaetet',
      p.diagnose,
      p.letzteBehandlung,
      p.sollAbstandWochen ?? '',
      p.faelligAm,
      p.status === 'ueberfaellig' ? p.tageUeberfaellig : '',
      p.vorfaelle.length,
    ].map(csvCell).join(';'));
  }
  return '﻿' + lines.join('\r\n');
}
