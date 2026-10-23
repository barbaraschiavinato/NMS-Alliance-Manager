"use client";

import { StationCardSimple } from "@/components/cards/station-card/simple";
import type { StationEntry } from "@/components/cards/station-card/parts";
import type { AllianceMember } from "@/lib/members/member-types";

type Sample = Readonly<{
  portal: string;
  galaxy: number;
  response: Record<string, unknown>;
}>;

const rangerId = "guide-ranger";
const otherId = "guide-other";

const ranger: AllianceMember = {
  publicId: rangerId,
  email: "",
  name: "Ranger",
  image: "",
  nmsName: "Ranger",
  nmsCode: "",
  platforms: [],
  specialty: "ranger",
  role: "user",
  membershipStatus: "approved",
  approvedBy: "",
  approvedAt: "",
  lastLogin: "",
  simpleView: true,
};

type Scenario = Readonly<{
  title: string;
  own: boolean;
  hasMissions: boolean;
  available: boolean;
  canOpen?: boolean;
  note: boolean;
}>;

const explorer: AllianceMember = {
  ...ranger,
  publicId: "guide-explorer",
  name: "Esploratore",
  nmsName: "Esploratore",
  specialty: "explorer",
};

const builder: AllianceMember = {
  ...ranger,
  publicId: "guide-builder",
  name: "Costruttore",
  nmsName: "Costruttore",
  specialty: "builder",
};

const explorerScenarios: Scenario[] = [
  {
    title: "Tua stazione (sei il proprietario), senza missioni associate",
    own: true,
    hasMissions: false,
    available: true,
    note: false,
  },
  {
    title: "Tua stazione (sei il proprietario), senza missioni associate, con note",
    own: true,
    hasMissions: false,
    available: true,
    note: true,
  },
  {
    title: "Stazione di un altro, senza missioni per la tua specializzazione: puoi crearne una per te",
    own: false,
    hasMissions: false,
    available: true,
    note: false,
  },
  {
    title: "Missione per la tua specializzazione libera o assegnata a te",
    own: false,
    hasMissions: true,
    available: false,
    canOpen: true,
    note: false,
  },
  {
    title: "Missione per la tua specializzazione già in corso assegnata ad un altro",
    own: false,
    hasMissions: true,
    available: false,
    canOpen: false,
    note: false,
  },
];

const rangerScenarios: Scenario[] = [
  {
    title: "Tua stazione, senza missioni associate",
    own: true,
    hasMissions: false,
    available: true,
    note: false,
  },
  {
    title: "Tua stazione, senza missioni associate, con note",
    own: true,
    hasMissions: false,
    available: true,
    note: true,
  },

  {
    title: "Tua stazione, con missioni associate da poter creare",
    own: true,
    hasMissions: true,
    available: true,
    note: false,
  },
  {
    title: "Tua stazione, con missioni associate e nessuna da creare",
    own: true,
    hasMissions: true,
    available: false,
    note: false,
  },
  {
    title: "Stazione di un altro, senza missioni",
    own: false,
    hasMissions: false,
    available: true,
    note: false,
  },
  {
    title: "Stazione di un altro, con missioni associate",
    own: false,
    hasMissions: true,
    available: false,
    note: false,
  },
];

const renderedAt = Date.parse("2030-01-01T00:00:00.000Z");
const noop = () => undefined;

export function RangerStationExamples({ sample }: Readonly<{ sample: Sample }>) {
  return <StationExamples member={ranger} sample={sample} scenarios={rangerScenarios} />;
}

export function RangerOwnStationExample({ sample }: Readonly<{ sample: Sample }>) {
  return <StationExamples member={ranger} sample={sample} scenarios={[rangerScenarios[0]]} showCaption={false} />;
}

export function ExplorerOwnStationExample({ sample }: Readonly<{ sample: Sample }>) {
  return (
    <StationExamples canSeeAll member={explorer} sample={sample} scenarios={[rangerScenarios[0]]} showCaption={false} />
  );
}

export function BuilderOwnStationExample({ sample }: Readonly<{ sample: Sample }>) {
  return (
    <StationExamples canSeeAll member={builder} sample={sample} scenarios={[rangerScenarios[0]]} showCaption={false} />
  );
}

export function ExplorerBuilderStationExamples({ sample }: Readonly<{ sample: Sample }>) {
  return <StationExamples member={explorer} sample={sample} scenarios={explorerScenarios} />;
}

export function ExplorerAvailableStationExample({ sample }: Readonly<{ sample: Sample }>) {
  return <StationExamples member={explorer} sample={sample} scenarios={[explorerScenarios[2]]} showCaption={false} />;
}

function StationExamples({
  member,
  sample,
  scenarios,
  showCaption = true,
  canSeeAll = false,
}: Readonly<{
  member: AllianceMember;
  sample: Sample;
  scenarios: Scenario[];
  showCaption?: boolean;
  canSeeAll?: boolean;
}>) {
  return (
    <div className="guide-examples">
      {scenarios.map((scenario) => {
        const station: StationEntry = {
          portal: sample.portal,
          galaxy: sample.galaxy,
          ownerId: scenario.own ? member.publicId : otherId,
          ownerName: scenario.own ? "Tu" : "Altro membro",
          createdAt: "2020-01-01T00:00:00.000Z",
          note: scenario.note ? "Esempio di nota della stazione." : undefined,
          planet: { galaxy: sample.galaxy, response: sample.response },
          hasMissions: scenario.hasMissions,
          canOpenOwnSpecialtyMission: scenario.canOpen ?? false,
          ...(scenario.canOpen ? { specialtyMissionId: `guide-${member.specialty}-mission` } : {}),
          hasAssignedMission: false,
          missionStatus: scenario.hasMissions ? "in_progress" : "none",
          availableSpecialties: scenario.available
            ? scenario.hasMissions
              ? ["explorer", "builder"]
              : ["all", "ranger", "explorer", "builder", "explorer_builder"]
            : [],
        };
        return (
          <figure className="guide-example" key={scenario.title}>
            {showCaption && <figcaption>{scenario.title}</figcaption>}
            <ul className="station-list station-list-cards">
              <StationCardSimple
                canCreateMissions={false}
                canSeeAll={canSeeAll}
                member={member}
                onCreateMission={noop}
                onEdit={noop}
                onOpenProfile={noop}
                onOpenStation={noop}
                onRemove={noop}
                onToggleStatus={noop}
                onViewNote={noop}
                planetStatuses={{}}
                planetStatusesLoaded
                renderedAt={renderedAt}
                savingStatusKeys={[]}
                station={station}
              />
            </ul>
          </figure>
        );
      })}
    </div>
  );
}
