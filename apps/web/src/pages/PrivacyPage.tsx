import { PageHead, Panel } from '../components/Panel.js';

export function PrivacyPage() {
  return (
    <>
      <PageHead
        title="Confidențialitate"
        lead="Ce date ținem, pe ce temei, cât timp, cine le vede și cum le scoți de aici."
      />

      <Panel
        title="Ce colectăm"
        hint="Nu cerem data nașterii, CNP-ul, adresa de domiciliu sau numărul de telefon."
      >
        <dl className="facts stacked">
          <dt>Nume afișat</dt>
          <dd>
            Te identifică în forum și la anunțuri. <small>Temei: executarea serviciului.</small>
          </dd>
          <dt>Adresa instituțională</dt>
          <dd>
            Creează contul și te autentifică. <small>Temei: executarea serviciului.</small>
          </dd>
          <dt>Grupa și semigrupa</dt>
          <dd>
            Opționale. Filtrează orarul, calendarul și termenele.{' '}
            <small>Temei: executarea serviciului.</small>
          </dd>
          <dt>Ce publici</dt>
          <dd>
            Postări, comentarii, anunțuri, cereri de contact, înscrieri la evenimente.{' '}
            <small>Temei: executarea serviciului.</small>
          </dd>
          <dt>Jurnale tehnice</dt>
          <dd>
            Ora cererii, ruta și adresa IP. <small>Temei: interes legitim, depanare și securitate.</small>
          </dd>
        </dl>
      </Panel>

      <Panel title="Cine vede ce">
        <ul className="posts">
          <li>
            <div>
              <strong>Adresa de email nu iese niciodată din server</strong>
              <small>
                Nici către alți studenți, nici către moderatori. Contactul de la anunțuri trece prin
                aplicație: cel care cere primește un status, autorul primește o notificare.
              </small>
            </div>
          </li>
          <li>
            <div>
              <strong>Ce publici e vizibil studenților autentificați</strong>
              <small>Împreună cu numele afișat și grupa, atât.</small>
            </div>
          </li>
          <li>
            <div>
              <strong>Moderatorii văd conținutul raportat și autorul afișat</strong>
              <small>Nu văd date de contact și nu pot șterge conturi.</small>
            </div>
          </li>
        </ul>
      </Panel>

      <Panel title="Rapoartele de moderare">
        <p className="content">
          Când raportezi o postare sau un anunț, se păstrează ce ai scris ca motiv, ținta raportului
          și contul tău, ca aceeași persoană să nu raporteze de două ori același lucru.{' '}
          <strong>Autorul conținutului nu află cine l-a raportat</strong>: primește doar o notificare
          că materialul a fost șters și motivul rezolvării.
        </p>
        <p className="content">
          Rapoartele sunt vizibile moderatorilor și rămân în coadă și după rezolvare, ca o decizie să
          poată fi verificată mai târziu. Dacă îți ștergi contul, raportul rămâne, dar fără legătură
          cu tine.
        </p>
      </Panel>

      <Panel title="Cât păstrăm">
        <dl className="facts">
          <dt>Contul și ce ai publicat</dt>
          <dd>Cât timp există contul.</dd>
          <dt>Jurnalele tehnice</dt>
          <dd>30 de zile.</dd>
          <dt>Sesiunile</dt>
          <dd>Expiră după 30 de zile de inactivitate.</dd>
        </dl>
      </Panel>

      <Panel title="Orarul și numele cadrelor didactice">
        <p className="content">
          Orarul importat conține nume de cadre didactice, preluate din fișierul oficial al
          facultății. Sunt date personale republicate, iar temeiul este interesul legitim de a face
          orarul utilizabil pentru studenți. Un nume poate fi scos din afișare.
        </p>
      </Panel>

      <Panel title="Ștergerea contului">
        <p className="content">
          Butonul din profil face anonimizare, nu ștergere fizică: numele devine „Utilizator șters”,
          adresa de email este înlocuită cu o valoare fără valoare de contact, parola se șterge.
          Postările rămân fără autor, ca firele de discuție să nu se rupă. Efectul e imediat și nu
          trece prin nicio cerere pe email.
        </p>
      </Panel>

      <Panel title="Drepturile tale">
        <p className="content">
          Acces, rectificare, ștergere, opoziție și portabilitate. Cele două care contează în
          practică le faci singur, din profil: îți schimbi datele oricând și îți ștergi contul fără
          să ceri voie nimănui.
        </p>
      </Panel>
    </>
  );
}
