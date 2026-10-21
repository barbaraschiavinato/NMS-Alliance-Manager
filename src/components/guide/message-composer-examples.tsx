import { MessageSquareText, Send } from "lucide-react";

export function MemberProfileExample({
  highlightFriendCode = false,
  readOnly = false,
}: Readonly<{ highlightFriendCode?: boolean; readOnly?: boolean }>) {
  return (
    <figure className="guide-example">
      <figcaption>Profilo del membro</figcaption>
      <div className="mission-dialog member-card-dialog guide-message-profile-example" inert>
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">PROFILO MEMBRO</span>
            <h2>Profilo NMS</h2>
          </div>
        </div>
        <div className="profile-identity">
          <span className="profile-google-avatar">A</span>
          <span>
            <strong>Alleato NMS</strong>
            <small>Nome in gioco</small>
          </span>
        </div>
        <dl className="member-card-details">
          <div>
            <dt>Specializzazione</dt>
            <dd>Esploratore</dd>
          </div>
          <div>
            <dt>Piattaforme</dt>
            <dd>PC, PlayStation</dd>
          </div>
          <div className={highlightFriendCode ? "guide-friend-code-highlight" : undefined}>
            <dt>Codice amico NMS</dt>
            <dd>ABCD-EFGH-JKLMN</dd>
          </div>
        </dl>
        {!readOnly && (
          <button className="primary-button member-message-open" type="button">
            <MessageSquareText aria-hidden="true" size={15} />
            Lascia un messaggio
          </button>
        )}
      </div>
    </figure>
  );
}

export function MessageComposerExamples() {
  return (
    <div className="guide-message-composer-examples">
      <MemberProfileExample />
      <figure className="guide-example">
        <figcaption>Modulo per scrivere un messaggio</figcaption>
        <div className="mission-dialog member-card-dialog guide-message-form-example" inert>
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">LASCIA UN MESSAGGIO</span>
              <h2>Scrivi un messaggio</h2>
            </div>
          </div>
          <div className="member-message-form">
            <p>A: Alleato NMS</p>
            <p className="member-message-subject">
              <strong>Oggetto</strong>
              Sistema scoperto
            </p>
            <label className="field">
              <span>Messaggio</span>
              <textarea readOnly rows={4} value="Ciao, vorrei chiederti informazioni su questo sistema." />
            </label>
            <label className="message-acknowledgement">
              <input checked readOnly type="checkbox" />
              <span>Confermo di voler inviare un messaggio relativo alla missione o al pianeta indicato.</span>
            </label>
            <button className="primary-button" type="button">
              <Send aria-hidden="true" size={15} />
              Invia messaggio
            </button>
          </div>
        </div>
      </figure>
    </div>
  );
}
