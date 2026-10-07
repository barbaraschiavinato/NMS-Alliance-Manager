import Image from "next/image";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { GlyphStrip } from "@/components/portal-address-field";
import { galaxyLabel } from "@/lib/galaxies";
import { useLocale } from "@/components/locale-provider";

type PlanetRecord = Record<string, unknown>;

const systemAttributes = [
  ["Star", "star"],
  ["Economy", "economy"],
  ["Conflict", "conflict"],
  ["Race", "race"],
] as const;

const planetConditions = [
  ["Type", "type"],
  ["Size", "size"],
  ["Features", "features"],
  ["Fauna", "fauna"],
  ["Flora", "flora"],
  ["Minerals", "minerals"],
  ["Weather", "weather"],
  ["Water", "water"],
  ["Sentinels", "sentinels"],
] as const;

function asRecord(value: unknown): PlanetRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as PlanetRecord : null;
}

function displayValue(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    const values = value.map(displayValue).filter((item): item is string => Boolean(item));
    return values.length > 0 ? values.join(", ") : null;
  }
  const record = asRecord(value);
  if (!record) return null;
  const word = typeof record.word === "string" ? record.word : null;
  const note = typeof record.note === "string" ? record.note : null;
  const starCount = typeof record.stars === "number" ? Math.max(0, Math.min(3, Math.floor(record.stars))) : null;
  const stars = starCount === null ? null : `${"★".repeat(starCount)}${"☆".repeat(3 - starCount)}`;
  const marks = Array.isArray(record.marks)
    ? record.marks.flatMap((mark) => {
      const markRecord = asRecord(mark);
      return typeof markRecord?.word === "string" ? [markRecord.word] : [];
    })
    : [];
  const parts = [word, note, stars, ...marks].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
}

function PlanetFacts({ band, fields }: Readonly<{
  band: PlanetRecord | null;
  fields: ReadonlyArray<readonly [string, string]>;
}>) {
  const { t } = useLocale();
  const facts = fields.flatMap(([label, key]) => {
    const value = band ? displayValue(band[key]) : null;
    return value ? [{ label, value }] : [];
  });
  if (facts.length === 0) return null;

  return (
    <dl className="planet-fact-list">
      {facts.map(({ label, value }) => <div className="planet-fact-row" key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>)}
    </dl>
  );
}

function PlanetSky({ sky }: Readonly<{ sky: PlanetRecord | null }>) {
  const { t } = useLocale();
  const colors = sky ? [
    { label: t("Day"), color: sky.day },
    { label: t("Night"), color: sky.night },
  ].filter((item): item is { label: string; color: string } =>
    typeof item.color === "string" && /^#[0-9A-F]{6}$/i.test(item.color),
  ) : [];
  if (colors.length === 0) return null;

  return (
    <div className="planet-sky-row">
      <span>{t("Sky")}</span>
      <div>{colors.map(({ label, color }) => <span aria-label={`${label} ${color}`} className="planet-sky-color" key={label} title={`${label} ${color}`}><i style={{ backgroundColor: color }} />{label}</span>)}</div>
    </div>
  );
}

function PlanetResources({ carries }: Readonly<{ carries: unknown[] }>) {
  const { t } = useLocale();
  const resources = carries.flatMap((entry) => {
    const record = asRecord(entry);
    return typeof record?.name === "string" && typeof record.kind === "string"
      ? [{ name: record.name, kind: record.kind }]
      : [];
  });
  const groups = [
    { name: "Minerals", kinds: ["mineral"] },
    { name: "Plants", kinds: ["plant", "consumable"] },
    { name: "Valuables", kinds: ["tradeable"] },
    { name: "Finds", kinds: ["component"] },
  ].map((group) => ({
    ...group,
    items: resources.filter((resource) => group.kinds.includes(resource.kind)).map((resource) => resource.name),
  })).filter((group) => group.items.length > 0);
  const otherResources = resources.filter((resource) => !groups.some((group) => group.kinds.includes(resource.kind)));
  if (otherResources.length > 0) groups.push({ name: "Other resources", kinds: [], items: otherResources.map((resource) => resource.name) });
  if (groups.length === 0) return null;

  return (
    <section aria-labelledby="planet-resources-title" className="planet-card-section planet-resources-section">
      <h4 id="planet-resources-title">{t("Resources")}</h4>
      <div className="planet-resource-groups">
        {groups.map((group) => <div className="planet-resource-group" key={group.name}>
          <h5><span>{t(group.name)}</span><span>{group.items.length}</span></h5>
          <ul>{group.items.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>)}
      </div>
    </section>
  );
}

export function PlanetCard({ portal, galaxy, title: cardTitle, contextLabel, missionDescription, onClose }: Readonly<{
  portal: string;
  galaxy: number;
  title: string;
  contextLabel?: string;
  missionDescription?: string;
  onClose: () => void;
}>) {
  const { t } = useLocale();
  const [planet, setPlanet] = useState<PlanetRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ address: portal, galaxy: String(galaxy) });
    fetch(`/api/missions/planet?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) {
          const message = asRecord(body)?.error;
          throw new Error(typeof message === "string" ? message : "Planet details are unavailable.");
        }
        const result = asRecord(asRecord(body)?.planet);
        if (!result) throw new Error("Invalid planet response.");
        setPlanet(result);
      })
      .catch((error_: unknown) => {
        if (!controller.signal.aborted) setError(error_ instanceof Error ? error_.message : "Planet details are unavailable.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [galaxy, portal]);

  const lines = asRecord(planet?.lines);
  const band = asRecord(lines?.band);
  const headline = asRecord(lines?.headline);
  const title = typeof headline?.word === "string" ? headline.word : t("Planet");
  const sentence = typeof lines?.sentence === "string" ? lines.sentence : "";
  const sky = asRecord(planet?.sky);
  const pictures = asRecord(planet?.pictures);
  const disc = pictures?.disc;
  const imageUrl = typeof disc === "string" && disc.startsWith("/planets/")
    ? `https://nmsalmanac.com/api${disc}`
    : null;
  const carries = Array.isArray(planet?.carries) ? planet.carries : [];

  return (
    <div className="dialog-backdrop planet-backdrop">
      <dialog aria-labelledby="planet-card-title" aria-modal="true" className="mission-dialog planet-dialog" open>
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">{t("PLANET DETAILS")} <span>·</span> {galaxyLabel(galaxy).toUpperCase()}</span>
            <h2 id="planet-card-title">{cardTitle}</h2>
            {missionDescription?.trim() && <p className="planet-dialog-mission-description">{missionDescription}</p>}
          </div>
          <button aria-label={t("Close planet details")} className="icon-button" onClick={onClose} type="button"><X size={18} /></button>
        </div>
        <div className="planet-card-body">
          <div className="planet-card-address"><GlyphStrip address={portal} large /><code>{portal}</code></div>
          {loading && <p aria-live="polite" className="planet-card-message">{t("Loading archived details…")}</p>}
          {!loading && error && <p className="planet-card-message planet-card-error">{t(error)}</p>}
          {planet && (
            <>
              <section aria-labelledby="planet-intro-title" className="planet-card-intro">
                {imageUrl && <Image alt="" className="planet-card-image" height={256} src={imageUrl} unoptimized width={256} />}
                <div>
                  <h3 id="planet-intro-title">{title}</h3>
                  {contextLabel && <p>{contextLabel}</p>}
                  {planet.paradise === true && <span className="planet-paradise-flag">{t("Paradise")}</span>}
                  <span className="planet-intro-code">{portal}</span>
                </div>
              </section>
              <section aria-labelledby="planet-conditions-title" className="planet-card-section">
                <h4 id="planet-conditions-title">{t("Conditions")}</h4>
                <PlanetFacts band={band} fields={planetConditions} />
                <PlanetSky sky={sky} />
                {sentence && <p className="planet-card-summary">{sentence}</p>}
              </section>
              <section aria-labelledby="planet-system-title" className="planet-card-section">
                <h4 id="planet-system-title">{t("System")}</h4>
                <PlanetFacts band={band} fields={systemAttributes} />
              </section>
              <PlanetResources carries={carries} />
              <div className="planet-card-attribution">{t("Data:")} <a href="https://nmsalmanac.com" rel="noreferrer" target="_blank">NMS Almanac</a></div>
            </>
          )}
          {!loading && !error && !planet && <p className="planet-card-message">{t("No Almanac details are archived for this mission.")}</p>}
        </div>
      </dialog>
    </div>
  );
}