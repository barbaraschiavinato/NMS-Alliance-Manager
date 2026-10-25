"use client";

import { MissionCardSimple } from "@/components/cards/mission-card/simple";
import type { AllianceMember } from "@/lib/members/member-types";
import type { Mission } from "@/lib/missions/missions";
import { planetSystemStatusKey, type MissionSystemStatus } from "@/lib/planets/planet-system-status";

type Sample = Readonly<{
  portal: string;
  galaxy: number;
  response: Record<string, unknown>;
}>;

const explorer: AllianceMember = {
  publicId: "guide-explorer",
  email: "",
  name: "Esploratore",
  image: "",
  nmsName: "Esploratore",
  nmsCode: "",
  platforms: [],
  specialty: "explorer",
  role: "user",
  membershipStatus: "approved",
  approvedBy: "",
  approvedAt: "",
  lastLogin: "",
  simpleView: true,
};

const ranger: AllianceMember = {
  ...explorer,
  publicId: "guide-ranger",
  name: "Ranger",
  nmsName: "Ranger",
  specialty: "ranger",
};
const builder: AllianceMember = {
  ...explorer,
  publicId: "guide-builder",
  name: "Costruttore",
  nmsName: "Costruttore",
  specialty: "builder",
};

type Scenario = Readonly<{
  title: string;
  status: Mission["status"];
  assigned: boolean;
  progress: number;
  statuses: readonly MissionSystemStatus[];
  request?: boolean;
  notes?: boolean;
}>;

const explorerScenarios: Scenario[] = [
  {
    title: "Missione disponibile: puoi prenderla in carico",
    status: "pending",
    assigned: false,
    progress: 0,
    statuses: [],
  },
  {
    title: "Missione assegnata a te, in attesa: puoi iniziarla",
    status: "pending",
    assigned: true,
    progress: 0,
    statuses: [],
  },
  {
    title: "Missione in corso, con note e voci da completare",
    status: "in_progress",
    assigned: true,
    progress: 27,
    statuses: ["mapped"],
    notes: true,
  },
  {
    title: "Missione in corso con tutte le tue voci spuntate: puoi completarla",
    status: "in_progress",
    assigned: true,
    progress: 80,
    statuses: ["mapped", "planets_classified", "data_uploaded"],
  },
  {
    title: "Missione completata: puoi riaprirla o richiedere l'intervento di un'altra specializzazione",
    status: "completed",
    assigned: true,
    progress: 100,
    statuses: ["mapped", "planets_classified", "data_uploaded"],
    request: true,
  },
];

const rangerScenarios: Scenario[] = [
  {
    title: "Missione disponibile: puoi prenderla in carico",
    status: "pending",
    assigned: false,
    progress: 0,
    statuses: [],
  },
  {
    title: "Missione assegnata a te, in attesa: puoi iniziarla",
    status: "pending",
    assigned: true,
    progress: 0,
    statuses: [],
  },
  {
    title: "Missione in corso, con note e voci da completare",
    status: "in_progress",
    assigned: true,
    progress: 27,
    statuses: ["station_claimed"],
    notes: true,
  },
  {
    title: "Missione in corso con tutte le tue voci spuntate: puoi completarla",
    status: "in_progress",
    assigned: true,
    progress: 80,
    statuses: ["station_claimed", "renamed"],
  },
  {
    title: "Missione completata: puoi riaprirla",
    status: "completed",
    assigned: true,
    progress: 100,
    statuses: ["station_claimed", "renamed"],
  },
];

const builderScenarios: Scenario[] = [
  {
    title: "Missione disponibile: puoi prenderla in carico",
    status: "pending",
    assigned: false,
    progress: 0,
    statuses: [],
  },
  {
    title: "Missione assegnata a te, in attesa: puoi iniziarla",
    status: "pending",
    assigned: true,
    progress: 0,
    statuses: [],
  },
  {
    title: "Missione in corso, con note e voci da completare",
    status: "in_progress",
    assigned: true,
    progress: 27,
    statuses: ["buildings_built"],
    notes: true,
  },
  {
    title: "Missione in corso con tutte le tue voci spuntate: puoi completarla",
    status: "in_progress",
    assigned: true,
    progress: 80,
    statuses: ["buildings_built", "bases_uploaded"],
  },
  {
    title: "Missione completata: puoi riaprirla o richiedere l'intervento di un'altra specializzazione",
    status: "completed",
    assigned: true,
    progress: 100,
    statuses: ["buildings_built", "bases_uploaded"],
    request: true,
  },
];

const noop = () => undefined;
const asyncNoop = () => Promise.resolve();

export function ExplorerMissionExamples({ sample }: Readonly<{ sample: Sample }>) {
  return <MissionExamples member={explorer} request="builder" sample={sample} scenarios={explorerScenarios} />;
}

export function ExplorerAvailableMissionExample({ sample }: Readonly<{ sample: Sample }>) {
  return <MissionExamples member={explorer} sample={sample} scenarios={[explorerScenarios[0]]} showCaptions={false} />;
}

export function BuilderAvailableMissionExample({ sample }: Readonly<{ sample: Sample }>) {
  return <MissionExamples member={builder} sample={sample} scenarios={[builderScenarios[0]]} showCaptions={false} />;
}

export function ExplorerMissionProgressExamples({ sample }: Readonly<{ sample: Sample }>) {
  const captions = [
    "Clicca su Inizia la missione",
    "Spunta i task",
    "Quando i task sono completi clicca su Completa Missione",
    "A questo punto diventa completata",
  ];
  const scenarios = explorerScenarios.slice(1).map((scenario, index) => ({ ...scenario, title: captions[index] }));

  return <MissionExamples member={explorer} request="builder" sample={sample} scenarios={scenarios} />;
}

export function BuilderMissionProgressExamples({ sample }: Readonly<{ sample: Sample }>) {
  const captions = [
    "Clicca su Inizia la missione",
    "Spunta i task",
    "Quando i task sono completi clicca su Completa Missione",
    "A questo punto diventa completata",
  ];
  const scenarios = builderScenarios.slice(1).map((scenario, index) => ({ ...scenario, title: captions[index] }));

  return <MissionExamples member={builder} request="explorer" sample={sample} scenarios={scenarios} />;
}

export function BuilderMissionExamples({ sample }: Readonly<{ sample: Sample }>) {
  return <MissionExamples member={builder} request="explorer" sample={sample} scenarios={builderScenarios} />;
}

export function RangerMissionExamples({ sample }: Readonly<{ sample: Sample }>) {
  return <MissionExamples member={ranger} sample={sample} scenarios={rangerScenarios} />;
}

function MissionExamples({
  member,
  request,
  sample,
  scenarios,
  showCaptions = true,
}: Readonly<{
  member: AllianceMember;
  request?: "builder" | "explorer";
  sample: Sample;
  scenarios: Scenario[];
  showCaptions?: boolean;
}>) {
  const name = typeof sample.response.name === "string" ? sample.response.name : sample.portal;
  const disc = (sample.response.pictures as { disc?: unknown } | undefined)?.disc;
  const planetImageUrl = typeof disc === "string" ? `https://nmsalmanac.com/api${disc}` : "";
  return (
    <div className="guide-examples">
      {scenarios.map((scenario, index) => {
        const mission: Mission = {
          id: `guide-mission-${index}`,
          title: name,
          description: "",
          notes: scenario.notes ? "Esempio di nota della missione." : undefined,
          system: name,
          systemAddress: sample.portal,
          galaxy: sample.galaxy,
          systemVerified: true,
          stationOwnerName: "Altro membro",
          stationOwnerMemberId: "guide-other",
          createdAt: "2020-01-01T00:00:00.000Z",
          assignedTo: scenario.assigned ? member.name : "",
          assignedMemberId: scenario.assigned ? member.publicId : undefined,
          targetSpecialty: member.specialty as Mission["targetSpecialty"],
          dueDate: "",
          status: scenario.status,
          priority: "normal",
          progress: scenario.progress,
        };
        return (
          <figure className="guide-example" key={scenario.title}>
            {showCaptions && <figcaption>{scenario.title}</figcaption>}
            <div className="mission-card-grid">
              <MissionCardSimple
                canManage={false}
                currentMember={member}
                getDiscovererImage={() => undefined}
                members={[member]}
                mission={mission}
                onClaim={noop}
                onComplete={noop}
                onCreateRangerMission={noop}
                onDeleteMission={noop}
                onEdit={noop}
                hideDetailLink
                onOpenPlanet={noop}
                onOpenProfile={noop}
                onReopen={noop}
                onStart={noop}
                onToggleSystemStatus={noop}
                onUpdateProgress={asyncNoop}
                onViewNotes={noop}
                onViewPlanetNotes={noop}
                planetImageUrl={planetImageUrl}
                systemPlanet={sample.response}
                requestedSpecialty={() => (scenario.request && request ? request : null)}
                stationOwners={[]}
                stationOwnersLoaded
                systemStatuses={{ [planetSystemStatusKey(sample.portal, sample.galaxy)]: [...scenario.statuses] }}
              />
            </div>
          </figure>
        );
      })}
    </div>
  );
}
