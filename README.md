# Nachsorge-Monitor

Prüft automatisch, ob die vorgegebenen Behandlungsabstände eingehalten wurden, und zwar
**für jedes Auge einzeln**. Gedacht für die intravitreale Injektionstherapie (IVOM) bei
feuchter AMD, diabetischem Makulaödem oder Venenverschluss sowie für Verlaufskontrollen.

> **Live-Demo:** https://niclasbayer.github.io/nachsorge-monitor/

> Entstanden als Live-Prototyp im Mini-Hackathon am 18.06.2026 (DOC Nürnberg).
> **Alle Beispieldaten sind frei erfunden, es werden keine echten Patientendaten verwendet.**

## Was das Tool kann

- **CSV hochladen** (Export aus dem Praxissystem) oder **Beispieldaten laden**.
- **Auswertung je Patient und Auge:** rechtes und linkes Auge sind getrennte Verläufe mit
  eigener Fälligkeit und eigener Warnung.
  - Verspätete Folgetermine in der Vergangenheit (Ist-Abstand größer als Soll-Abstand).
  - Aktueller Status: Ist der nächste Folgetermin bereits überfällig?
- **Status je Auge:** Überfällig / Verspätet / Im Plan, mit 7 Tagen Toleranz.
- **Dashboard:** Kennzahlen, Karten der auffälligen Augen, Tabelle aller Verläufe mit
  Hinweis „Folgetermin in X Tagen fällig".
- **Report-Download (CSV)** aller auffälligen Augen-Verläufe.

## Datenschutz

Die Auswertung läuft **vollständig im Browser**. Eine hochgeladene CSV wird nicht an einen
Server übertragen und nicht gespeichert; beim Neuladen der Seite ist sie weg.

## Erwartetes CSV-Format

Trennzeichen `;`, `,` oder Tab. Datum als `TT.MM.JJJJ` oder `JJJJ-MM-TT`.
Auge als `rechts`/`links`, `R`/`L` oder `OD`/`OS`.

| Spalte | Pflicht |
|---|---|
| Patienten-ID | ja |
| Behandlungsdatum | ja |
| Soll-Abstand (Wochen) | ja |
| Name, Auge, Diagnose, Behandlung | nein |

Die Spaltennamen werden flexibel erkannt (z. B. „Datum", „Termin", „Intervall").
Ein Beispiel liegt unter [`public/beispiel-patienten.csv`](public/beispiel-patienten.csv).

## Lokal starten

```bash
npm install
npm run dev
```

Dann http://localhost:8080 öffnen.

## Technik

- [React 18](https://react.dev/) + [Vite 6](https://vite.dev/), reine Frontend-App
- Auswertungslogik in `src/analyse.js`
- Deployment automatisch über GitHub Actions auf GitHub Pages

## Mögliche nächste Schritte

- Priorisierung nach Tagen **und** klinischem Risiko (AMD/DMÖ kritischer als Kontrolle)
- Filter und Suche (nur Überfällige, nach Patient oder Diagnose)
- Planungsansicht: welche Augen werden in den nächsten 2 bis 4 Wochen fällig?
- Soll-Abstand je Diagnose vorbelegen, falls er im Export fehlt
- Toleranz im Dashboard einstellbar machen
- Einlesen an die echten Spaltennamen des Praxisexports anpassen
