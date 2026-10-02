"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Carte de la qualité de l'air (indice ATMO global + NO2/O3/PM10/PM2.5/SO2) par département,
 * aujourd'hui et demain. Données publiées par le pipeline alertesmeteo-hub/qualite-air-atmo-france
 * (source Atmo France), elles-mêmes agrégées depuis des zones commune ou EPCI selon l'AASQA
 * (voir le README de ce dépôt pour le détail des pièges rencontrés avec l'API Atmo Data).
 *
 * Seuls les départements métropolitains sont représentés sur la carte (le GeoJSON de contours
 * ne couvre pas les DOM) ; les DOM sont malgré tout présents dans les données brutes.
 */
const RAW_QUALITE_AIR = "https://raw.githubusercontent.com/alertesmeteo-hub/qualite-air-atmo-france/main/";
const RAW_GEOJSON = "https://raw.githubusercontent.com/alertesmeteo-hub/harmonie/main/config/departements-france.geojson";
const W = 700;

type Ring = [number, number][];
type DeptGeo = { code: string; nom: string; polygons: Ring[][] };
type JourData = Record<string, number | null> & { nbZones?: number };
type DeptData = { parJour: Record<string, JourData> };
type ApiData = { generatedAt: string; jours: [string, string]; departements: Record<string, DeptData> };

const POLLUANTS = [
  { key: "code_qual", label: "Indice global" },
  { key: "code_no2", label: "NO₂" },
  { key: "code_o3", label: "O₃" },
  { key: "code_pm10", label: "PM10" },
  { key: "code_pm25", label: "PM2.5" },
  { key: "code_so2", label: "SO₂" },
] as const;

// Memes couleurs que l'integration Home Assistant Atmo France (et observees directement dans
// les reponses de l'API, champ coul_qual) : 0 indisponible -> 7 evenement.
const NIVEAU_COULEUR: Record<number, string> = {
  0: "#dddddd",
  1: "#50F0E6",
  2: "#50CCAA",
  3: "#F0E641",
  4: "#FF5050",
  5: "#960032",
  6: "#872181",
  7: "#888888",
};
const NIVEAU_LABEL: Record<number, string> = {
  0: "Indisponible",
  1: "Bon",
  2: "Moyen",
  3: "Dégradé",
  4: "Mauvais",
  5: "Très mauvais",
  6: "Extrêmement mauvais",
  7: "Évènement",
};
const PAS_DE_DONNEES = "#f4f4f5";

type Tip = { x: number; y: number; nom: string; code: string; niveau: number | null; nbZones?: number };

export function QualiteAirModule() {
  const [status, setStatus] = useState("Chargement de la qualité de l'air…");
  const [depts, setDepts] = useState<DeptGeo[]>([]);
  const [data, setData] = useState<ApiData | null>(null);
  const [jourIdx, setJourIdx] = useState<0 | 1>(0);
  const [polluant, setPolluant] = useState<(typeof POLLUANTS)[number]["key"]>("code_qual");
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [geo, api] = await Promise.all([
          fetch(RAW_GEOJSON).then((r) => r.json()),
          fetch(`${RAW_QUALITE_AIR}data/departements.json`).then((r) => r.json()) as Promise<ApiData>,
        ]);
        if (cancelled) return;
        const list: DeptGeo[] = geo.features.map((f: { properties: { code: string; nom: string }; geometry: { type: string; coordinates: unknown } }) => {
          const polygons = f.geometry.type === "Polygon" ? [f.geometry.coordinates as Ring[]] : (f.geometry.coordinates as Ring[][]);
          return { code: f.properties.code, nom: f.properties.nom, polygons };
        });
        setDepts(list);
        setData(api);
        setStatus("");
      } catch {
        if (!cancelled) setStatus("Données indisponibles pour le moment, réessayez dans quelques minutes.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const bbox = useMemo<[number, number, number, number] | null>(() => {
    if (!depts.length) return null;
    const all = depts.flatMap((d) => d.polygons.flat(2));
    const lons = all.map((c) => c[0]);
    const lats = all.map((c) => c[1]);
    return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
  }, [depts]);

  const H = useMemo(() => {
    if (!bbox) return 0;
    const [x0, y0, x1, y1] = bbox;
    const kx = Math.cos((((y0 + y1) / 2) * Math.PI) / 180);
    return Math.round((W * (y1 - y0)) / ((x1 - x0) * kx));
  }, [bbox]);

  const proj = useMemo(() => {
    if (!bbox) return null;
    const [x0, y0, x1, y1] = bbox;
    return (lon: number, lat: number) => [((lon - x0) / (x1 - x0)) * W, (1 - (lat - y0) / (y1 - y0)) * H] as const;
  }, [bbox, H]);

  const jour = data?.jours[jourIdx];

  if (status) return <p className="text-sm">{status}</p>;
  if (!bbox || !proj || !data || !jour) return null;

  const pathDe = (d: DeptGeo) =>
    d.polygons
      .map((poly) => poly.map((ring) => ring.map(([lon, lat]) => proj(lon, lat).join(",")).join(" L")).map((s) => `M${s}Z`).join(" "))
      .join(" ");

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold">Qualité de l&apos;air</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Indice ATMO par département (pire valeur constatée parmi ses communes/EPCI), aujourd&apos;hui et demain. Source : Atmo France.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-1">
          {(["Aujourd'hui", "Demain"] as const).map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => setJourIdx(i as 0 | 1)}
              className={`rounded border px-3 py-1.5 text-sm ${jourIdx === i ? "border-foreground bg-foreground text-background" : "border-zinc-300 dark:border-zinc-700"}`}
            >
              {label} — {data.jours[i]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {POLLUANTS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPolluant(p.key)}
              className={`rounded border px-2.5 py-1 text-xs font-semibold ${polluant === p.key ? "border-foreground bg-foreground text-background" : "border-zinc-300 dark:border-zinc-700"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-2xl">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseLeave={() => setTip(null)}>
          {depts.map((d) => {
            const valeurs = data.departements[d.code]?.parJour[jour];
            const niveau = valeurs ? valeurs[polluant] : null;
            const fill = typeof niveau === "number" ? NIVEAU_COULEUR[niveau] ?? PAS_DE_DONNEES : PAS_DE_DONNEES;
            const [cx, cy] = proj(
              (Math.min(...d.polygons.flat(2).map((c) => c[0])) + Math.max(...d.polygons.flat(2).map((c) => c[0]))) / 2,
              (Math.min(...d.polygons.flat(2).map((c) => c[1])) + Math.max(...d.polygons.flat(2).map((c) => c[1]))) / 2,
            );
            return (
              <path
                key={d.code}
                d={pathDe(d)}
                fill={fill}
                stroke="#52525b"
                strokeWidth={0.5}
                className="cursor-pointer transition-opacity hover:opacity-80"
                onMouseEnter={() =>
                  setTip({ x: (cx / W) * 100, y: (cy / H) * 100, nom: d.nom, code: d.code, niveau: typeof niveau === "number" ? niveau : null, nbZones: valeurs?.nbZones })
                }
              />
            );
          })}
        </svg>
        {tip && (
          <div
            className="pointer-events-none absolute z-10 w-52 -translate-x-1/2 -translate-y-full rounded border border-zinc-300 bg-white/95 p-2 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-900/95"
            style={{ left: `${tip.x}%`, top: `${tip.y}%`, marginTop: -10 }}
          >
            <div className="font-semibold">
              {tip.nom} ({tip.code})
            </div>
            <div>{tip.niveau != null ? NIVEAU_LABEL[tip.niveau] : "Pas de données"}</div>
            {tip.nbZones != null && <div className="text-zinc-500">{tip.nbZones} zone(s) agrégée(s)</div>}
          </div>
        )}
      </div>

      <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <span key={n} className="flex items-center gap-1">
            <i style={{ background: NIVEAU_COULEUR[n] }} className="inline-block h-3 w-3 rounded-sm" />
            {NIVEAU_LABEL[n]}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <i style={{ background: PAS_DE_DONNEES }} className="inline-block h-3 w-3 rounded-sm border border-zinc-300" />
          Pas de données
        </span>
      </div>
    </section>
  );
}
