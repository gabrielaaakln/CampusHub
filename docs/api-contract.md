# Contract API

Prefix: `/api/v1`. Convențiile sunt fixate înainte de primul endpoint și nu se renegociază per rută.

## Generalități

- Paginare obligatorie pe orice listă: `?page=&limit=` (implicit 20, maxim 100), răspuns
  `{ data, meta: { page, limit, total, has_next } }`.
- Format unic de eroare, dintr-un singur middleware:
  `{ "error": { "code": "...", "message": "...", "details": ... } }`.
- Coduri de eroare: `bad_request` 400, `unauthorized` 401, `forbidden` 403, `not_found` 404,
  `conflict` 409, `validation_failed` 422, `rate_limited` 429, `internal_error` 500.
- Datele se transmit ca ISO 8601 cu offset. Serverul nu presupune niciodată fusul clientului.
- Validare `zod` pe fiecare rută, schema în `packages/shared`, refolosită pe frontend.
- Context implicit din sesiune: `/schedule` fără parametri înseamnă orarul grupei și al semigrupei
  curente.

## Autentificare

- Sesiune în cookie `httpOnly`, `sameSite: lax`, `secure` în producție, prefix `__Host-` în producție.
- CSRF double submit pe toate metodele care schimbă starea. Ia un token de la `GET /csrf` și
  trimite-l ca antet `x-csrf-token`.
- Tokenul CSRF e legat de id-ul de sesiune: după login sau logout trebuie cerut din nou.
- Limite: 100 req/min global, 10 req/min pe scriere, 5 la 15 minute pe login (eșecurile contează,
  reușitele nu).

## Endpoint-uri implementate

| Metodă | Rută | Auth | Note |
|---|---|---|---|
| GET | `/health` | - | verifică și baza de date; 503 dacă baza nu răspunde |
| GET | `/config` | - | flag-uri de funcționalități și facultatea curentă |
| GET | `/csrf` | - | `{ data: { token } }` |
| POST | `/auth/register` | - | 201; doar domenii instituționale; 409 la email duplicat; **montat doar cu flag-ul `registration`**, care implicit e stins în producție |
| POST | `/auth/login` | - | 200 cu utilizatorul; mesaj identic pentru parolă greșită și cont inexistent; **montat doar cu flag-ul `passwordLogin`** |
| POST | `/auth/logout` | - | 204 |
| GET | `/auth/me` | - | 200 cu `data: null` pentru anonimi |
| PATCH | `/auth/me` | da | nume afișat, grupă, semigrupă |
| DELETE | `/auth/me` | da | anonimizare, nu ștergere fizică; 204 |
| GET | `/schedule` | - | orarul grupei; `?groupId=&subgroup=&termId=` sau contextul din sesiune |
| GET | `/schedule/status` | - | ultima rulare și ultimele schimbări ale grupei |
| POST | `/schedule/import` | admin | multipart, câmpul `file`, maxim 2 MB; 422 dacă sursa e goală |
| GET | `/buildings` | - | clădirile facultății, cu numărul de etaje și de săli |
| GET | `/buildings/:id/floors` | - | etajele unei clădiri; `svgUrl` doar cu flag-ul `floorplans` |
| GET | `/floors/:id/rooms` | - | sălile unui etaj |
| GET | `/rooms/search?q=&limit=` | - | fuzzy pe numărul sălii **și** pe alias-uri; maxim 50 |
| GET | `/rooms/:id` | - | fișa sălii plus orele care se țin în ea săptămâna aceasta |
| GET | `/me/calendar?from=&to=` | da | agregat orar + termene + evenimente, maxim 62 de zile |
| GET | `/notifications?page=&limit=&unread=` | da | `meta` are în plus `unread` |
| PATCH | `/notifications/:id/read` | da | 204; 404 dacă notificarea e a altcuiva |
| PATCH | `/notifications/read-all` | da | `{ data: { marked } }` |
| GET | `/forum/categories` | - | cu numărul de postări |
| GET | `/forum/posts?sort=new\|top&categoryId=&subjectId=&q=&page=` | - | `myVote` e 0 pentru anonimi |
| POST | `/forum/posts` | da | 201 cu postarea creată |
| GET | `/forum/posts/:id` | - | — |
| DELETE | `/forum/posts/:id` | autor sau moderator | ștergere logică, 204 |
| GET | `/forum/posts/:id/comments` | - | listă plată cu `parentCommentId` și `depth`; arborele se face în ecran |
| POST | `/forum/posts/:id/comments` | da | 201 cu lista completă; `parentCommentId` pentru răspuns, `depth` maxim 5 |
| POST | `/forum/posts/:id/vote` · `/forum/comments/:id/vote` | da | `{ value: 1 \| -1 \| 0 }`, 0 șterge votul |
| GET | `/listings?kind=&subjectId=&q=&mine=&page=` | - | — |
| POST | `/listings` | da | 201 |
| GET | `/listings/requests` | da | cererile primite și cele trimise |
| GET | `/listings/:id` | - | — |
| PATCH · DELETE | `/listings/:id` | autor sau moderator | status, preț, descriere; ștergere logică |
| POST | `/listings/:id/requests` | da | 409 dacă ai cerut deja sau anunțul e închis |
| PATCH | `/requests/:id` | autorul anunțului | acceptă, refuză, încheie |
| DELETE | `/forum/comments/:id` | autor sau moderator | ștergere logică, 204 |
| GET | `/events?from=&to=&mine=&page=` | - | doar cu flag-ul `events`; fără `from` începe de acum |
| POST | `/events` | moderator | 201; `roomId` leagă evenimentul de o sală reală |
| GET | `/events/:id` | - | — |
| DELETE | `/events/:id` | moderator | ștergere logică, 204 |
| POST · DELETE | `/events/:id/attend` | da | înscriere și retragere; întorc evenimentul actualizat |
| GET | `/rights?q=&category=&page=` | - | căutare full-text, `meta.categories` vine în același răspuns |
| POST | `/reports` | da | 201; 409 dacă ai raportat deja, 400 pe propriul conținut |
| GET | `/moderation/reports?status=&page=` | moderator | doar cu flag-ul `moderationPanel`; `meta.counts` pe stări |
| PATCH | `/moderation/reports/:id` | moderator | `{ status, deleteTarget }` |
| GET | `/groups?studyYear=&q=` | - | grupele facultății, pentru profil |
| GET | `/subjects` | - | disciplinele facultății, pentru termene |
| GET | `/deadlines?from=&to=&subjectId=&mine=&page=` | - | termenele grupei tale plus cele ale facultății |
| POST | `/deadlines` | da | 201; fără `groupId` intră pe grupa autorului, `null` cere moderator |
| PATCH · DELETE | `/deadlines/:id` | autor sau moderator | ștergere logică |
| GET | `/me/calendar.ics` | da | doar cu flag-ul `icsExport`; fișier `text/calendar` |
| GET | `/search?q=&type=&limit=` | - | full-text peste postări, anunțuri și drepturi |

### `POST /schedule/import`

Calea N0: merge fără niciun scraper. Răspunsul este raportul rulării.

```json
{
  "data": {
    "runId": 4, "status": "success",
    "found": 40, "added": 1, "changed": 1, "removed": 2,
    "unresolvedSubjects": ["Ingineria Programării"],
    "errors": []
  }
}
```

`status` este `partial` când s-a importat, dar ceva merită citit: supapa de siguranță s-a declanșat,
o grupă din fișier nu există, un slot apare de două ori. `failed` înseamnă că sursa nu a returnat
nicio intrare și **nu s-a dezactivat nimic**.

Supapa de siguranță: dacă peste 30% dintre sloturile active lipsesc din sursă, nimic nu se
dezactivează, rularea se marchează `partial` și motivul intră în `errors`.

### `GET /rooms/search`

Caută fără diacritice și cu greșeli de scriere. Numărul sălii se compară fără separatori
(`ac17` găsește `AC1-7`), alias-urile se compară cu spații (`lab retele` găsește sala în care se
ține laboratorul de rețele). Un rezultat gol este `{ "data": [] }`, nu o eroare.

```json
{ "data": [ {
  "id": 45, "number": "A1-13", "roomType": "laborator", "capacity": null,
  "directions": "Corp A (DAIA), Etaj 1",
  "notes": null, "aliases": ["lab Sisteme cu evenimente discrete"],
  "floor": { "id": 18, "level": 1, "label": "Etaj 1" },
  "building": { "id": 7, "name": "Corp A (DAIA)", "code": "A", "address": "...",
                "latitude": 47.15598, "longitude": 27.60191,
                "entranceLat": 47.15586, "entranceLng": 27.60178 }
} ] }
```

`svgElementId` apare doar când flag-ul `floorplans` e pornit. Alias-urile sunt reale, nu inventate:
sunt derivate din laboratoarele care se țin efectiv în sala respectivă.

### `GET /me/calendar`

O singură formă pentru toate sursele. Frontend-ul nu știe nimic despre paritate, semigrupe sau
vacanțe: serverul a aplicat deja calendarul academic.

```json
{ "data": {
  "term": { "id": 1, "academicYear": "2025-2026", "semester": 2, "timezone": "Europe/Bucharest" },
  "weeks": [ { "index": 5, "parity": "impar", "startsOn": "2026-08-03", "endsOn": "2026-08-09" } ],
  "items": [
    { "id": "sched:412:2026-08-03", "kind": "class", "title": "Programare web", "type": "laborator",
      "startsAt": "2026-08-03T16:00:00.000+03:00", "endsAt": "2026-08-03T18:00:00.000+03:00",
      "professor": "ș.l.dr.ing. A. Archip", "group": "1306",
      "room": { "id": 17, "number": "C1-4", "building": "Corp C" } },
    { "id": "deadline:88", "kind": "deadline", "title": "Tema 2", "type": "tema",
      "startsAt": "2026-08-09T23:59:00.000+03:00", "endsAt": null, "subjectId": 4 },
    { "id": "event:12", "kind": "event", "title": "Hackathon AC",
      "startsAt": "2026-08-10T10:00:00.000+03:00", "endsAt": "2026-08-10T16:00:00.000+03:00" }
  ]
} }
```

Reguli aplicate de server, în ordine: în afara `[starts_on, ends_on]` nu se generează nimic; zilele
din `academic_breaks` se sar; paritatea zilei se calculează din `first_week_parity`; intră doar
`parity IN ('ambele', paritatea zilei)`, `subgroup IN (0, semigrupa ta)` și, dacă intrarea are
`starts_week` / `ends_week`, doar săptămânile din interval. Data se combină cu `TIME` **în fusul
facultății**, deci ora rămâne aceeași și după schimbarea orei.

`id` este stabil între apeluri: `sched:<id intrare>:<data>`.

### Forum și anunțuri: ce nu se trimite niciodată

**Adresa de email nu apare în niciun răspuns**, nici măcar pentru moderatori. Autorul e
`{ id, displayName, groupName }`. Contactul dintre studenți trece prin `POST /listings/:id/requests`:
autorul anunțului primește o notificare, iar cele două persoane se înțeleg din aplicație.

Un cont anonimizat apare peste tot ca „Utilizator șters”, cu grupa golită. O postare sau un
comentariu șters logic își păstrează locul, ca firul discuției să nu se rupă.

Voturile: `{ value: 1 | -1 | 0 }`. Zero **șterge rândul**, pentru că scorul e întreținut de un
trigger care face `SUM` peste `post_votes`. Răspunsul întoarce scorul recitit din bază, nu unul
calculat în aplicație.

### `GET /notifications`

N0 e polling: frontend-ul cere lista la 60 de secunde (`refetchInterval`, o linie). `meta.unread`
alimentează badge-ul din antet, deci un singur apel ține și lista, și numărul.

```json
{ "data": [ { "id": 12, "type": "schedule_changed",
              "title": "Orarul grupei tale s-a schimbat",
              "body": "2 ore noi, 1 modificată", "link": "/orar",
              "isRead": false, "createdAt": "2026-08-05T21:30:00.000Z" } ],
  "meta": { "page": 1, "limit": 20, "total": 3, "has_next": false, "unread": 2 } }
```

Tipurile emise acum: `schedule_changed` (importerul, o notificare per grupă per rulare),
`listing_request`, `listing_request_answered` și `content_removed` (moderatorul a șters ceva).

### `GET /events`

Lista începe de acum înainte, nu de la începutul timpului: fără `from` serverul folosește momentul
cererii. `mine=true` păstrează doar evenimentele la care ești înscris. Înscrierea de două ori
înseamnă tot o înscriere, iar `POST` și `DELETE /events/:id/attend` întorc evenimentul recitit, deci
ecranul nu trebuie să ghicească numărul nou.

```json
{ "data": [ {
  "id": 3, "title": "Târg de practică și internship",
  "description": "Firme din Iași.", "location": null,
  "room": { "id": 2, "number": "AC0-2", "building": "Corp AC" },
  "startsAt": "2026-08-15T10:00:00.000+03:00", "endsAt": "2026-08-15T16:00:00.000+03:00",
  "externalUrl": null, "author": { "id": 3, "displayName": "Maria Ursu", "groupName": "1306" },
  "attendeeCount": 3, "isAttending": false, "createdAt": "2026-08-06T00:26:52.944Z"
} ], "meta": { "page": 1, "limit": 20, "total": 5, "has_next": false } }
```

Aceleași evenimente apar și în `GET /me/calendar`, cu `kind: "event"`. Modulul e în spatele
flag-ului `events`: când e stins, rutele nu există deloc.

### `GET /rights`

Conținutul e scris de mână și încărcat prin seed, deci nu există rută de scriere. `q` intră în
`search_vector` prin `websearch_to_tsquery` cu configurația `ro_unaccent`: „contestatie" găsește
„Contestația la examen", iar „burse" găsește și „bursa". Un articol cu `facultyId: null` e valabil
pentru toată universitatea și apare în aceeași listă.

`meta.categories` conține toate categoriile existente, nu doar pe cele din pagina curentă — filtrul
din interfață nu are nevoie de un al doilea apel și nu se golește când cauți.

### `POST /reports` și `GET /moderation/reports`

Raportarea e N0 și rămâne pornită chiar dacă panoul e stins: un raport ajunge în `reports` oricum.
Ținta e polimorfică (`post`, `comment`, `listing`, `user`) și se rezolvă în cod, cu un `switch`, o
interogare per tip. Nu poți raporta propriul conținut (400) și nu poți raporta același lucru de două
ori (409).

```json
{ "data": [ {
  "id": 1, "targetType": "post", "targetId": 3,
  "reason": "Postarea nu are legătură cu facultatea.", "status": "open",
  "reporter": { "id": 2, "displayName": "Vlad Munteanu", "groupName": "1306" },
  "handledBy": null, "handledAt": null, "createdAt": "2026-08-06T00:26:52.960Z",
  "target": { "title": "Cât durează să iei permisul?", "excerpt": "În medie două luni...",
              "link": "/forum/3", "isDeleted": false }
} ], "meta": { "page": 1, "limit": 20, "total": 2, "has_next": false,
               "counts": { "open": 2, "resolved": 0, "dismissed": 1 } } }
```

`PATCH /moderation/reports/:id` primește `{ status: "resolved" | "dismissed", deleteTarget }`.
Cu `deleteTarget: true` conținutul se șterge **logic** și autorul primește o notificare
`content_removed`. Un cont nu se șterge de aici (400): ban-ul e o altă decizie. Toate rapoartele
deschise pe aceeași țintă primesc același răspuns odată, ca să nu rămână duplicate în coadă.

### `GET /deadlines`

Un termen fără grupă aparține întregii facultăți și îl vede toată lumea; unul cu grupă e vizibil doar
grupei respective. Lista începe de acum înainte, ca și evenimentele. Un student scrie implicit pentru
grupa lui: dacă trimite `groupId: null` primește 403, pentru că „toată facultatea" e o decizie de
moderator.

Termenele apar și în `GET /me/calendar` cu `kind: "deadline"`, deci ecranul de calendar nu trebuie
să le ceară separat ca să le arate.

### `GET /me/calendar.ics`

Aceleași date ca `/me/calendar`, în formatul pe care îl citesc Google Calendar, Outlook și telefonul.
Fereastra implicită e de la acum minus 7 zile până la plus 120; `from` și `to` o pot schimba.

Toate momentele sunt scrise în **UTC** (`DTSTART:20260803T130000Z`), deci fișierul nu conține niciun
bloc `VTIMEZONE` și nu depinde de fusul aplicației care îl citește. Un termen n-are sfârșit, așa că
primește 30 de minute — un eveniment de lungime zero e ascuns de unele calendare.

### `GET /search`

O singură listă, ordonată după `ts_rank`, peste trei surse. Tipul e o etichetă, nu o secțiune.
Configurația `ro_unaccent` face ca „contestatie" să găsească „Contestația la examen". Interogarea
folosește `websearch_to_tsquery`, deci ghilimelele și `-cuvânt` funcționează ca într-un motor de
căutare obișnuit.

```json
{ "data": [ { "type": "rights", "id": 12, "title": "Bursa socială",
              "excerpt": "Se acordă în funcție de venitul pe membru de familie.",
              "meta": "Burse", "link": "/drepturi" } ],
  "meta": { "q": "bursa", "counts": { "post": 1, "listing": 0, "rights": 3 } } }
```

### `GET /config`

```json
{
  "features": {
    "scraper": false, "floorplans": false, "uploads": false, "sse": false,
    "emailVerify": false, "events": true, "moderationPanel": true, "icsExport": true,
    "sso": false, "passwordLogin": true, "registration": true
  },
  "faculty": { "id": 1, "shortName": "AC", "name": "...", "timezone": "Europe/Bucharest" }
}
```

Frontend-ul citește asta o dată la boot și ascunde ce nu există. Un flag stins nu e o gaură vizibilă
în interfață, ci o variantă mai simplă a aceluiași ecran.

