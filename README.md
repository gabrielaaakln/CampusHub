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

## Module

### Orar

Orarul grupei și al semigrupei tale, pe zile, cu interval orar, disciplină, tip de activitate,
paritatea săptămânii, profesor și sală. Sala vine cu indicațiile pe care le scrie facultatea
(„Corp A (DAIA), Etaj 1"), nu doar cu codul.

Sub orar apare raportul ultimului import: ce adaptor a rulat, când, câte activități au fost citite,
adăugate, modificate și scoase, plus ultimele schimbări care afectează grupa ta.

### Import de orar

Orarul nu se scrie de mână. Intră printr-un singur pipeline, cu adaptoare interschimbabile:

| Adaptor | Sursă |
|---|---|
| `ManualAdapter` | CSV pus de un om |
| `XlsxAdapter` | fișierul Excel real publicat de facultate |

Tot ce vine după parsare este cod comun: normalizare fără diacritice, rezolvarea disciplinei și a
sălii, diff în memorie, scriere, istoric, notificări. Un scraper automat ar fi doar un al treilea
adaptor, fără nicio altă modificare.

Cheia unui rând de orar este slotul (semestru, grupă, semigrupă, zi, oră de început, tip, paritate),
iar disciplina, sala și profesorul sunt atribute. Diferența dintre ele de la o rulare la alta *este*
detecția de modificări: fiecare import scrie ce s-a adăugat, ce s-a schimbat (cu valorile dinainte și
de după) și ce a dispărut, apoi trimite o singură notificare per grupă per rulare.

Există o supapă de siguranță: dacă peste 30% dintre sloturile active lipsesc din fișier, nimic nu se
dezactivează, rularea se marchează ca parțială și motivul intră în raport. Fără ea, o sursă cu
structura schimbată ar șterge orarul întregii facultăți la primul import.

Adminul are un ecran de import pe pagina de orar: alege fișierul, îl încarcă și vede raportul pe loc.

Parserul pentru formatul real merită menționat separat. Fișierul facultății își documentează gramatica
într-o celulă de legendă și are 10 foi de orar plus două dicționare, `Săli` (65 de săli, cu locația
scrisă pentru studenți) și `Profesori` (238 de acronime cu numele complet). Parserul clasifică tokenii
după dicționare, nu după poziție în celulă. Rezultatul pe fișierul real: **1667 de activități, zero
erori, 97% cu sală identificată și 98% cu profesor**.

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

Datele de demo nu sunt inventate de la zero. Un modul de seed citește fișierul Excel real al facultății
și derivă din el 10 clădiri, 65 de săli cu indicații, 57 de grupe și 94 de discipline cu alias-uri,
apoi importă orarul prin exact același pipeline ca un upload. O bază proaspătă are deci deja o rulare de
import și un istoric de schimbări.
