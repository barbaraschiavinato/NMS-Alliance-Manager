"use client";

import { useState } from "react";
import {
  PlanetDestinationCard,
  type PlanetDestination,
  type PlanetVisitControls,
} from "@/components/cards/planet-destination-card";
import { PlanetCard } from "@/components/modals/planet-card";

export function PlanetListExampleView({
  planet,
  planetData,
}: Readonly<{
  planet: PlanetDestination;
  planetData: Readonly<Record<string, unknown>>;
}>) {
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [visited, setVisited] = useState(false);
  const visits: PlanetVisitControls = {
    isVisited: () => visited,
    isSaving: () => false,
    onToggle: (_planet, value) => setVisited(value),
  };

  return (
    <div className="guide-example">
      <div className="guide-examples">
        <figure className="guide-example">
          <figcaption>Esempio di scheda pianeta</figcaption>
          <div className="planet-mission-list">
            <PlanetDestinationCard onOpen={() => undefined} planet={planet} />
          </div>
        </figure>
        <figure className="guide-example">
          <figcaption>Variante dimostrativa con simbolo Paradiso</figcaption>
          <div className="planet-mission-list">
            <PlanetDestinationCard
              onOpen={() => undefined}
              planet={{
                ...planet,
                id: `${planet.id}-paradise`,
                paradise: true,
              }}
            />
          </div>
        </figure>
        <figure className="guide-example">
          <figcaption>Variante dimostrativa con simbolo Dissonante</figcaption>
          <div className="planet-mission-list">
            <PlanetDestinationCard
              onOpen={() => undefined}
              planet={{
                ...planet,
                id: `${planet.id}-dissonant`,
                dissonant: true,
              }}
            />
          </div>
        </figure>
        <figure className="guide-example">
          <figcaption>Pianeta che puoi visitare: spunta «Visitato» (solo a scopo dimostrativo)</figcaption>
          <div className="planet-mission-list">
            <PlanetDestinationCard
              onOpen={() => undefined}
              planet={{ ...planet, id: `${planet.id}-visitable`, canMarkVisited: true }}
              visits={visits}
            />
          </div>
        </figure>
      </div>
      <h4 id="pianeti-scheda" style={{ color: "var(--lime)" }}>
        Scheda pianeta
      </h4>
      <p>
        La stessa scheda si apre cliccando una card pianeta, il nome di una missione nella pagina Missioni o il nome di
        una stazione nella pagina Stazioni.
      </p>
      {detailsOpen && (
        <PlanetCard
          galaxy={planet.galaxy}
          initialPlanetPortal={planet.planetPortal}
          initialPlanetData={planetData}
          onClose={() => setDetailsOpen(false)}
          inlinePreview
          portal={planet.portal}
          title={planet.station?.name ?? planet.title ?? "Pianeta"}
        />
      )}
      {!detailsOpen && (
        <button className="primary-button" onClick={() => setDetailsOpen(true)} type="button">
          Mostra di nuovo la scheda pianeta
        </button>
      )}
    </div>
  );
}
