"use client";

import { GlyphStrip, PortalValidation, type SystemAddressLookup } from "@/components/shared/portal-address-field";
import { decodePortalAddress } from "@/lib/missions/missions";

type Sample = Readonly<{ portal: string; galaxy: number }>;

type Step = Readonly<{ title: string; text: string; address: string; status?: SystemAddressLookup["status"] }>;

export function AddressValidationExample({ sample }: Readonly<{ sample: Sample }>) {
  const steps: Step[] = [
    {
      title: "1. Indirizzo portale vuoto",
      text: "Finché non inserisci i glifi il form ti chiede un indirizzo portale completo.",
      address: "",
    },
    {
      title: "2. Indirizzo portale incompleto",
      text: "Mentre digiti vedi quanti glifi hai inserito e le cinque barre sotto (pianeta, sistema, Y, Z, X) si riempiono.",
      address: sample.portal.slice(0, 6),
    },
    {
      title: "3. Indirizzo portale non valido",
      text: "Con 12 glifi l'indirizzo portale viene decodificato: se un valore non è ammesso (qui l'indice del pianeta può andare solo da 0 a 6) la barra diventa rossa e vedi il motivo.",
      address: `7${sample.portal.slice(1)}`,
    },
    {
      title: "4. Controllo su Server Pianeti",
      text: "Se l'indirizzo portale è valido, viene cercato il pianeta su Server Pianeti nella galassia scelta.",
      address: sample.portal,
      status: "checking",
    },
    {
      title: "5. Pianeta trovato",
      text: "Il pianeta esiste: nome e tipo vengono usati per calcolare il nome della stazione e puoi salvare.",
      address: sample.portal,
      status: "found",
    },
    {
      title: "6. Pianeta non registrato",
      text: "Il pianeta non risulta su Server Pianeti ma potrebbe esistere nel gioco: l'indirizzo portale è segnalato in giallo, come avviso. Puoi comunque creare la stazione.",
      address: sample.portal,
      status: "not-found",
    },
    {
      title: "7. Servizio non raggiungibile",
      text: "Se Server Pianeti non risponde o ha raggiunto il limite di richieste, l'indirizzo portale resta valido ma il controllo non è stato possibile. Puoi comunque creare la stazione.",
      address: sample.portal,
      status: "unavailable",
    },
  ];
  return (
    <div className="guide-examples guide-validation-examples">
      {steps.map((step, index) => {
        const lookup: SystemAddressLookup | null = step.status
          ? { address: step.address, galaxy: sample.galaxy, status: step.status }
          : null;
        return (
          <figure className="guide-example" key={step.title}>
            <figcaption>
              <strong>{step.title}</strong>
              <br />
              {step.text}
            </figcaption>
            <div className="portal-field" inert>
              <GlyphStrip address={step.address} large />
              <PortalValidation
                address={step.address}
                decoded={decodePortalAddress(step.address)}
                id={`guide-address-validation-${index}`}
                lookup={lookup}
              />
            </div>
          </figure>
        );
      })}
    </div>
  );
}
