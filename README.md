# CampusHub

Platformă web pentru studenții Facultății de Automatică și Calculatoare din cadrul Universității
Tehnice „Gheorghe Asachi" din Iași. Rulează public la [www.tuiasicampus.me](https://www.tuiasicampus.me).

Un student intră cu adresa instituțională, își alege grupa și primește într-un singur loc orarul
importat din fișierul oficial al facultății, o hartă pe care găsește sala după cod sau după ce se
ține în ea, un calendar care adună ore, termene și evenimente, un forum, anunțuri între studenți,
evenimentele facultății și un ghid al drepturilor studentului.

Aplicația nu procesează plăți și nu scoate niciodată adrese de email prin API, nici măcar către
moderatori.

## Problema de la care a pornit

Un boboc din primul semestru primește orarul ca fișier Excel publicat pe site-ul facultății, iar
sălile sunt scrise cu coduri (`A1-13`, `C2-6`) pe care nimeni nu i le explică. Termenele circulă pe
grupuri de WhatsApp, evenimentele pe Facebook, iar regulamentele de burse și de examinare sunt PDF-uri
pe care le găsești doar dacă știi deja ce cauți. Nimic din toate astea nu răspunde la întrebarea de
dimineață: ce am acum, unde, și ce urmează.

Ecranul principal al aplicației, „Acum", răspunde fix la ea.

## Roluri

| Rol | Ce poate în plus |
|---|---|
| student | tot ce ține de conținut propriu: postări, comentarii, voturi, anunțuri, cereri, termene pe grupa lui, înscriere la evenimente, rapoarte |
| moderator | coada de rapoarte, ștergerea conținutului altora, publicarea de evenimente, termene pentru toată facultatea |
| admin | tot ce poate moderatorul, plus importul de orar |

Rolurile sunt ierarhice: adminul cuprinde moderatorul. Verificarea se face în server la fiecare
operație, nu în interfață. Interfața doar ascunde ce oricum ar fi refuzat.

## Autentificare

Formularul cu parolă a rămas în spatele unui flag, pentru cele două conturi de prezentare și pentru
teste. Înregistrarea cu parolă e un flag separat, stins în producție: până când nu există confirmare pe
mail, nimic nu dovedește că adresa tastată e a ta, iar un formular deschis pe un site public ar
distribui conturi care arată instituțional. Cu flagul stins, ruta nu se montează deloc.

## Feature flags

Un singur fișier de configurare citește flagurile, iar o rută publică le expune interfeței. Frontendul
le citește o dată la pornire și ascunde ce nu există. Un modul cu flagul stins nu are rute deloc, iar
ecranul lui redirectează în loc să afișeze un buton mort.

Starea din producție, la data scrierii:

| Flag | Stare | Ce înseamnă |
|---|---|---|
| `passwordLogin` | pornit | formularul cu parolă, pentru conturile de demo |
| `registration` | stins | nu se pot face conturi cu parolă |
| `events` | pornit | modulul de evenimente |
| `moderationPanel` | pornit | coada de rapoarte |
| `icsExport` | pornit | exportul de calendar |
| `uploads` | stins | imagini la anunțuri, endpointul nu există încă |
| `floorplans` | stins | planuri SVG pe hartă, fișierele nu sunt desenate |
| `sse` | stins | notificări prin flux deschis, polling-ul e suficient |
| `scraper` | stins | import automat nocturn |
| `emailVerify` | stins | confirmare pe mail |

Regula după care se aprind: un flag pornit e o promisiune către frontend. Dacă endpointul din spate nu
există, flagul stă stins.

## Datele

PostgreSQL 16, 30 de tabele, 16 tipuri enumerate. Câteva lucruri care nu sunt evidente:

- căutarea merge printr-o configurație proprie care ignoră diacriticele și aplică stemming românesc,
  plus indexuri trigram pentru potrivirea aproximativă;
- scorurile de la voturi și numărul de comentarii sunt întreținute de trigger-e, nu de aplicație;
- ștergerea e logică peste tot unde firul discuției sau istoricul contează;
- coloanele normalizate (fără diacritice, minuscule) există separat de forma de afișare, iar aceeași
  funcție de normalizare se folosește și la scriere, și la citire.
