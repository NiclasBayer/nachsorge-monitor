import { useState } from 'react';
import { werteAus, reportCsv, verschiebeDemoDaten } from './analyse.js';

// Synthetischer Beispiel-Datensatz aus public/ (funktioniert lokal und unter /<repo>/ auf GitHub Pages)
const DEMO_CSV_URL = `${import.meta.env.BASE_URL}beispiel-patienten.csv`;

// ============================================================================
//  Nachsorge-Monitor — Behandlungsabstände automatisch prüfen
//  CSV hochladen -> Abstände JE AUGE auswerten -> Dashboard + Report.
//  Die Auswertung läuft komplett im Browser (src/analyse.js), kein Server.
//  Es werden ausschliesslich synthetische Beispieldaten verwendet.
// ============================================================================

const STATUS_LABEL = {
  ueberfaellig: 'Überfällig',
  verspaetet: 'Verspätet',
  ok: 'Im Plan',
};

function Badge({ status }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>;
}

function EyeTag({ auge, label, short }) {
  if (!auge) return <span className="muted-text">–</span>;
  const text = short ? (auge === 'R' ? 'Rechts' : 'Links') : label || (auge === 'R' ? 'Rechtes Auge' : 'Linkes Auge');
  return <span className={`eye eye-${auge}`}>{text}</span>;
}

export default function App() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [source, setSource] = useState('');

  function analyze(csv, label) {
    setError('');
    try {
      setResult(werteAus(csv));
      setSource(label || 'Hochgeladene CSV');
    } catch (err) {
      setError(err.message || 'Auswertung fehlgeschlagen.');
    }
  }

  function downloadReport() {
    const blob = new Blob([reportCsv(result)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nachsorge-report.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => analyze(String(reader.result), file.name);
    reader.onerror = () => setError('Die Datei konnte nicht gelesen werden.');
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  }

  async function loadDemo() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(DEMO_CSV_URL);
      if (!res.ok) throw new Error('Beispieldaten konnten nicht geladen werden.');
      setResult(werteAus(verschiebeDemoDaten(await res.text())));
      setSource('Beispiel-Datensatz (synthetisch)');
    } catch (err) {
      setError(err.message || 'Beispieldaten konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }

  const auffaellig = result ? result.verlaeufe.filter((p) => p.status !== 'ok') : [];

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          Nachsorge-Monitor
          <span className="brand-sub">Behandlungsabstände je Auge prüfen</span>
        </div>
        {result && <span className="pill muted">Stichtag: {result.meta.stichtag}</span>}
      </header>

      <main className="container">
        {!result && (
          <section className="card upload-card">
            <h1>Patientendaten auswerten</h1>
            <p className="lead">
              Laden Sie eine exportierte Patienten-CSV hoch. Das System prüft für
              <strong> jedes Auge einzeln</strong>, ob die vorgegebenen Behandlungsabstände
              eingehalten wurden, und meldet überfällige oder verspätete Folgetermine.
            </p>

            <div className="upload-actions">
              <label className="btn btn-primary file-btn">
                CSV-Datei hochladen
                <input type="file" accept=".csv,text/csv" onChange={handleFile} hidden />
              </label>
              <button className="btn btn-ghost" onClick={loadDemo} disabled={loading}>
                Beispieldaten laden
              </button>
              <a className="link" href={DEMO_CSV_URL} download="beispiel-patienten.csv">Beispiel-CSV ansehen</a>
            </div>

            <div className="cols-hint">
              <span className="cols-hint-label">Erwartete Spalten</span>
              <code>Patienten-ID · Name · Auge · Behandlungsdatum · Diagnose · Behandlung · Soll-Abstand (Wochen)</code>
            </div>

            <p className="note">
              Hinweis: Für den Prototyp werden ausschliesslich erfundene Testdaten verwendet – keine echten Patientendaten.
            </p>
            {loading && <p className="status-line">Wird ausgewertet…</p>}
            {error && <p className="error-line">{error}</p>}
          </section>
        )}

        {result && (
          <>
            <section className="toolbar">
              <div className="toolbar-info">
                <strong>{source}</strong>
                <span className="muted-text"> · ausgewertet zum {result.meta.stichtag}</span>
              </div>
              <div className="toolbar-actions">
                <button className="btn btn-primary" onClick={downloadReport}>Report herunterladen (CSV)</button>
                <button className="btn btn-ghost" onClick={() => setResult(null)}>Neue Datei</button>
              </div>
            </section>

            <section className="kpis">
              <Kpi value={result.meta.patienten} label="Patienten" />
              <Kpi value={result.meta.behandlungen} label="Behandlungen" />
              <Kpi value={result.meta.ueberfaellig} label="Überfällig" tone="ueberfaellig" />
              <Kpi value={result.meta.verspaetet} label="Verspätet" tone="verspaetet" />
              <Kpi value={result.meta.ok} label="Im Plan" tone="ok" />
            </section>
            <p className="kpi-caption">
              Status wird <strong>pro Auge</strong> ausgewertet · {result.meta.augen} Augen-Verläufe aus {result.meta.patienten} Patienten ·
              Toleranz {result.meta.toleranzTage} Tage
            </p>

            <section className="card">
              <h2>
                Auffällige Augen
                <span className="count-chip">{auffaellig.length}</span>
              </h2>
              {auffaellig.length === 0 && (
                <p className="empty-good">Alle Behandlungsabstände wurden eingehalten.</p>
              )}
              <div className="alert-grid">
                {auffaellig.map((p) => (
                  <PatientCard key={`${p.patient_id}-${p.auge}`} p={p} />
                ))}
              </div>
            </section>

            <section className="card">
              <h2>Alle Augen-Verläufe</h2>
              <div className="table-wrap">
                <table className="grid">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Patienten-ID</th>
                      <th>Name</th>
                      <th>Auge</th>
                      <th>Diagnose</th>
                      <th>Behandlung</th>
                      <th>Letzte Beh.</th>
                      <th>Intervall</th>
                      <th>Folgetermin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.verlaeufe.map((p) => (
                      <tr key={`${p.patient_id}-${p.auge}`} className={`row-${p.status}`}>
                        <td><Badge status={p.status} /></td>
                        <td className="mono">{p.patient_id}</td>
                        <td>{p.name}</td>
                        <td><EyeTag auge={p.auge} short /></td>
                        <td>{p.diagnose}</td>
                        <td>{p.behandlung}</td>
                        <td>{p.letzteBehandlung}</td>
                        <td>{p.sollAbstandWochen ? `${p.sollAbstandWochen} Wo.` : '–'}</td>
                        <td>{folgeterminText(p)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Kpi({ value, label, tone }) {
  return (
    <div className={`kpi ${tone ? `kpi-${tone}` : ''}`}>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

function folgeterminText(p) {
  if (p.status === 'ueberfaellig') {
    return <span className="t-danger">{p.tageUeberfaellig} Tage überfällig</span>;
  }
  if (p.tageBisFaellig != null && p.tageBisFaellig <= 14 && p.faelligAm) {
    return <span className="t-soon">in {p.tageBisFaellig} Tagen ({p.faelligAm})</span>;
  }
  if (p.faelligAm) return <span className="muted-text">{p.faelligAm}</span>;
  return <span className="muted-text">–</span>;
}

function PatientCard({ p }) {
  return (
    <div className={`alert-card alert-${p.status}`}>
      <div className="alert-head">
        <Badge status={p.status} />
        <EyeTag auge={p.auge} label={p.augeLabel} />
        <span className="alert-id mono">{p.patient_id}</span>
        <span className="alert-name">{p.name}</span>
      </div>
      <div className="alert-sub">{p.diagnose} · {p.behandlung}</div>

      {p.status === 'ueberfaellig' && (
        <div className="alert-main t-danger">
          Folgetermin seit {p.tageUeberfaellig} Tagen überfällig
          <div className="alert-detail">
            Letzte Behandlung {p.letzteBehandlung} · planmäßig fällig {p.faelligAm}
            {p.sollAbstandWochen ? ` (alle ${p.sollAbstandWochen} Wochen)` : ''}
          </div>
        </div>
      )}

      {p.vorfaelle.filter((v) => v.typ === 'verspaetet').length > 0 && (
        <div className="alert-incidents">
          <div className="alert-incidents-title">Verspätete Folgetermine im Verlauf:</div>
          <ul>
            {p.vorfaelle
              .filter((v) => v.typ === 'verspaetet')
              .map((v, i) => (
                <li key={i}>
                  {v.von} → {v.bis}: <strong>{v.istTage} statt {v.sollTage} Tage</strong>{' '}
                  <span className="over">(+{v.ueberzugTage})</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {p.status === 'verspaetet' && p.tageBisFaellig != null && p.faelligAm && (
        <div className="alert-detail">
          Nächster Folgetermin fällig {p.faelligAm}
          {p.tageBisFaellig >= 0 ? ` (in ${p.tageBisFaellig} Tagen)` : ''}
        </div>
      )}
    </div>
  );
}
