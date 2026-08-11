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

