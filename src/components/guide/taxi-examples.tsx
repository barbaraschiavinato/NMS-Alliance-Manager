"use client";

import { ChevronDown, Orbit, Send } from "lucide-react";
import Link from "next/link";
import { HeroAddButton } from "@/components/layout/hero";
import { MessageCard } from "@/components/cards/message-card";
import { MemberProfileExample } from "@/components/guide/message-composer-examples";
import { stationDetailHref } from "@/lib/detail-links";

const noop = () => undefined;

export function TaxiExamples() {
  return (
    <div className="guide-taxi-examples">
      <figure className="guide-example">
        <figcaption>Richiedi un taxi</figcaption>
        <div className="guide-add-station-button-example" inert>
          <HeroAddButton label="taxi.new_request" onClick={noop} />
        </div>
      </figure>
      <figure className="guide-example">
        <figcaption>Modulo per richiedere un taxi</figcaption>
        <div className="mission-dialog member-card-dialog guide-taxi-form-example" inert>
          <div className="dialog-heading">
            <h2>Richiedi un taxi</h2>
          </div>
          <div className="member-message-form">
            <label className="field">
              <span>Galassia di destinazione</span>
              <div className="taxi-combobox">
                <input readOnly value="10 · Eissentam" />
                <button className="taxi-combobox-toggle" type="button" aria-label="Apri o chiudi le galassie">
                  <ChevronDown size={18} aria-hidden="true" />
                </button>
              </div>
            </label>
            <label className="field">
              <span>Punto d&apos;incontro</span>
              <div className="taxi-combobox">
                <input readOnly value="Hub dell'alleanza · Euclide · 0123456789AB" />
                <button className="taxi-combobox-toggle" type="button" aria-label="Apri o chiudi i punti d'incontro">
                  <ChevronDown size={18} aria-hidden="true" />
                </button>
              </div>
            </label>
            <label className="field">
              <span>Messaggio</span>
              <textarea readOnly rows={4} value="Cerco un passaggio per Eissentam. Ci incontriamo all'hub?" />
            </label>
            <label className="message-acknowledgement">
              <input checked readOnly type="checkbox" />
              <span>Confermo che il messaggio riguarda la richiesta di taxi.</span>
            </label>
            <button className="primary-button" type="button">
              <Send size={15} aria-hidden="true" />
              Invia richiesta
            </button>
          </div>
        </div>
      </figure>
      <figure className="guide-example">
        <figcaption>
          Richiesta taxi e risposta: clicca sul nome del mittente o di chi ha risposto per aprire la scheda NMS e vedere
          il suo codice amico
        </figcaption>
        <ul className="messages-list" inert>
          <MessageCard
            title="Taxi verso Eissentam"
            titleDetails={
              <Link
                className="message-meeting-station"
                href={stationDetailHref({ ownerId: "example", portal: "0123456789AB", galaxy: 0 })}
              >
                <Orbit size={15} aria-hidden="true" />
                Incontro: Hub dell&apos;alleanza · Euclide
              </Link>
            }
            participants={
              <>
                Da:{" "}
                <button className="member-profile-link" type="button">
                  Alleato NMS
                </button>
              </>
            }
            body="Cerco un passaggio per Eissentam. Ci incontriamo all'hub?"
            createdAt="2026-01-01T12:00:00.000Z"
            formattedDate="01/01/2026, 12:00"
            deleteLabel="Elimina richiesta"
            onReply={noop}
            replies={
              <ul className="message-thread-children">
                <MessageCard
                  participants={
                    <>
                      Da:{" "}
                      <button className="member-profile-link" type="button">
                        Pilota NMS
                      </button>
                    </>
                  }
                  body="Ti accompagno io! Trovi il mio codice amico cliccando sul mio nome. Ci vediamo all'hub."
                  createdAt="2026-01-01T12:05:00.000Z"
                  formattedDate="01/01/2026, 12:05"
                  deleteLabel="Elimina risposta"
                />
              </ul>
            }
          />
        </ul>
      </figure>
      <div className="guide-message-composer-examples">
        <MemberProfileExample highlightFriendCode readOnly />
      </div>
    </div>
  );
}
