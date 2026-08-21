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

## Fluxul unui student

1. Intră cu contul instituțional TUIASI. Nu există formular de înregistrare pe site-ul public.
2. La prima intrare ajunge pe profil și își alege grupa și semigrupa dintr-o listă reală de 57 de
   grupe. Tokenul de la Microsoft nu conține grupa, deci pasul ăsta nu poate fi sărit.
3. De acolo, Orarul, Calendarul și „Acum" se completează singure.

## Module

### Acum

Ecranul de start. Arată ora în desfășurare sau următorul curs, cu sala, profesorul și un buton care
duce direct la sala respectivă pe hartă. Alături stau un card cu ziua ta (câte ore ai azi, prima,
ultima, cât a trecut din zi) și restul orelor de astăzi. Sub ele, ultimele notificări.

Cardul spune și ce fel de oră urmează, curs sau laborator, pentru că asta schimbă unde te duci și ce
iei cu tine. Când chiar ești la oră, cardul își schimbă titlul în „În desfășurare" și primește un fond
distinct.

Ecranul nu are endpoint propriu: refolosește calendarul pe șapte zile și alege în client ce e acum și
ce urmează.

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

### Hartă

Cele 10 clădiri ale campusului, cu pini pe hartă OpenStreetMap. Coordonatele nu sunt estimate: vin din
conturul real al clădirilor, iar pinul e punctul cel mai adânc din interiorul poligonului, verificat
cu point-in-polygon pentru fiecare corp. La clădirile în formă de U sau L centroidul ar fi căzut în
curte. Acolo unde se poate deduce o fațadă, harta știe și intrarea.

Căutarea de sală tolerează greșeli de scriere și lipsa diacriticelor, și merge pe două căi:

- după codul sălii, ignorând separatorii, deci `ac17` găsește `AC1-7`;
- după alias, deci `lab retele` găsește sala în care se ține efectiv laboratorul de rețele.

Alias-urile nu sunt inventate. Sunt derivate din activitățile care se țin în fiecare sală, așa cum
apar în orarul real: 80 de alias-uri generate automat.

Rezultatul deschide fișa sălii: clădire, etaj, indicații text, tip de sală și orele care se țin acolo
săptămâna aceasta. Sala selectată stă în URL, deci butonul „Arată sala pe hartă" din alte ecrane duce
direct acolo.

### Calendar și termene

O singură vedere pe săptămână, ca tablou, cu ziua curentă marcată, navigare înainte și înapoi și
buton de întoarcere la săptămâna curentă. Adună trei surse: orele din orar, termenele și evenimentele.

Traducerea din regulă săptămânală în momente concrete o face serverul, nu interfața. Se aplică, în
ordine: limitele semestrului, vacanțele și sesiunile, paritatea săptămânii calculată din paritatea
primei săptămâni, semigrupa ta, intervalele de tipul „doar după săptămâna 7", și abia la final data se
combină cu ora în fusul facultății. Ultimul pas contează: la schimbarea orei din toamnă, o lipire
naivă ar decala toate cursurile cu o oră pentru o săptămână întreagă.

Tot din calendar se administrează termenele: temă, examen, proiect sau altceva, cu disciplină și
descriere. Un termen fără grupă e pentru toată facultatea și cere rol de moderator, ca să nu anunțe
primul student care greșește un câmp o temă pentru 57 de grupe.

Butonul „Descarcă .ics" scoate același calendar în formatul citit de Google Calendar, Outlook și
telefon. Momentele se scriu în UTC, fără bloc de fus orar, deci fișierul nu depinde de setările
aplicației care îl deschide.

### Forum

Cinci categorii (Anul 1, Cursuri și laboratoare, Examene și sesiune, Cămin și cazare, Timp liber),
sortare după cele mai noi sau după scor, filtrare pe categorie și pe disciplină, căutare în titluri și
paginare.

O postare are voturi, comentarii imbricate până la nivelul 5 și buton de raportare. Voturile pe
postări și pe comentarii merg în ambele sensuri, iar al doilea click pe același vot îl retrage.
Scorul nu se calculează în aplicație: e întreținut de trigger-e în baza de date și citit înapoi din
ea după fiecare vot, deci o eroare acolo se vede imediat.

Ștergerea e logică peste tot: postarea sau comentariul își păstrează locul, ca firul discuției să nu
se rupă.

### Anunțuri

Piața internă a facultății. Un anunț e produs sau serviciu, cu titlu, descriere, preț opțional și
unitate de preț („oră", „lucrare"). Meditațiile sunt un serviciu, nu un modul separat.

Filtrare pe tip, pe disciplină și pe text, plus filtrul „ale mele". Statusurile sunt activ, rezervat
și închis.

Contactul dintre studenți trece prin cereri, nu prin adrese de email. Cine e interesat trimite o
cerere cu un mesaj, autorul primește o notificare și răspunde cu acceptare sau refuz. Nicio adresă nu
iese din server în tot fluxul.

Termenii sunt scriși în ecran: anunțurile pentru redactarea de lucrări sau proiecte la comandă sunt
interzise, la fel și bunurile restricționate.

### Evenimente

Evenimentele facultății, listate de acum înainte, nu de la începutul timpului. Fiecare poate fi legat
de o sală reală din hartă. Înscrierea și retragerea sunt idempotente și întorc evenimentul recitit,
deci numărul de înscriși e mereu cel din bază. Există filtrul „unde m-am înscris", iar publicarea cere
rol de moderator.

Evenimentele apar și în calendar, alături de ore și termene.

### Drepturile studentului

Paisprezece intrări pe opt categorii: burse, examinare, cazare, reprezentare, practică, mobilități,
taxe și date personale. Fiecare are un rezumat scris pe înțelesul unui student și, unde există, link
către regulamentul oficial de pe site-ul universității.

Se poate filtra pe categorie și căuta full-text. Căutarea ignoră diacriticele și face stemming
românesc, deci „contestatie" găsește „Contestația la examen" și „burse" găsește „bursa".

### Notificări

Listă cu badge în bara de sus, marcare ca citit una câte una sau toate deodată. Lista se reîmprospătează
la 60 de secunde, iar același răspuns aduce și numărul de necitite, deci un singur apel ține și lista,
și badge-ul.

Tipurile emise acum: orarul grupei s-a schimbat, ai primit o cerere la un anunț, cererea ta a primit
răspuns, un moderator ți-a șters ceva.

### Căutare globală

Un câmp de căutare în bara de sus, valabil din orice ecran. Caută simultan în postări, anunțuri și
drepturi și întoarce o singură listă ordonată după relevanță, cu tipul ca etichetă pe rând. Cine caută
„bursa" vrea răspunsul, nu trei coloane.

Interogarea acceptă ghilimele și excluderea cu minus, ca într-un motor de căutare obișnuit.

### Moderare

Raportarea se face din forum și din anunțuri și funcționează indiferent dacă panoul e pornit sau nu.
Nu poți raporta propriul conținut și nu poți raporta același lucru de două ori.

Moderatorul are o coadă cu rapoartele, filtrabilă pe stare, în care ținta e rezolvată și afișată (ce
postare, ce anunț, ce comentariu). Poate rezolva sau respinge un raport și poate șterge conținutul
odată cu asta. Ștergerea e logică, iar autorul primește o notificare: o ștergere tăcută arată ca un bug
al aplicației, nu ca o decizie.

Când trei studenți raportează aceeași postare, rezolvarea o închide o singură dată pentru toate
rapoartele deschise pe acea țintă. Un cont nu se poate șterge din panou.

Panoul include și regula scrisă după care se rezolvă coada, aceeași pentru toți.

### Profil și cont

Nume afișat, grupă aleasă dintr-o listă reală și semigrupă limitată la câte are grupa respectivă.

Ștergerea contului e anonimizare, nu ștergere fizică: numele devine „Utilizator șters", adresa e
înlocuită cu o valoare fără valoare de contact, parola se șterge, iar legătura cu identitatea
instituțională dispare, ca următoarea autentificare să nu reintre în contul șters. Postările rămân
fără autor, ca discuțiile să nu se rupă. Efectul e imediat și nu cere cerere prin email.

Există și o pagină de informare privind prelucrarea datelor, accesibilă din subsol.

## Roluri

| Rol | Ce poate în plus |
|---|---|
| student | tot ce ține de conținut propriu: postări, comentarii, voturi, anunțuri, cereri, termene pe grupa lui, înscriere la evenimente, rapoarte |
| moderator | coada de rapoarte, ștergerea conținutului altora, publicarea de evenimente, termene pentru toată facultatea |
| admin | tot ce poate moderatorul, plus importul de orar |

Rolurile sunt ierarhice: adminul cuprinde moderatorul. Verificarea se face în server la fiecare
operație, nu în interfață. Interfața doar ascunde ce oricum ar fi refuzat.

## Autentificare

Contul se obține **doar** intrând cu identitatea instituțională TUIASI, prin Entra ID. Fluxul e
authorization code cu PKCE, cu `state` și `nonce` ținute în sesiune și consumate o singură dată, iar
`id_token`-ul se validează pe cheile publice ale tenantului: semnătură, emitent, audiență, vechime și
`nonce`. Codul se schimbă pe token pe canalul din spate.

Ambele domenii instituționale, `tuiasi.ro` și `student.tuiasi.ro`, sunt în același tenant, iar
aplicația cere autentificarea chiar la acel tenant. Filtrul „doar conturi de la universitate" se aplică
la Microsoft, înainte să ajungă ceva la noi, iar domeniul adresei se verifică a doua oară în server.

Identitatea păstrată e subiectul stabil emis pentru aplicația noastră, nu un identificator global, deci
două aplicații diferite nu pot corela același student.

Ce nu face aplicația niciodată: nu cere parola instituțională într-un formular propriu. Parola se
tastează doar pe pagina universității. Un formular care ar face altfel ar fi phishing funcțional.

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
| `sso` | pornit | intrare cu contul instituțional |
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

## Interfața

Sistemul vizual e unul tipografic internațional, în stil Swiss Grid: paletă acromatică, linii de un
pixel, colțuri drepte, fără umbre, un singur font (Space Grotesk) servit din aplicație. Există ambele
teme, deschisă și închisă, cu buton de comutare în bară; implicit se ia preferința sistemului, iar
alegerea utilizatorului se reține.

Paleta nu are culori de stare, deci singurul accent tare e inversarea, iar ea se cheltuie pe elementul
activ din meniu. Cardurile care trebuie scoase în față primesc un fond mai închis, nu o culoare: un
bloc negru pe jumătate de ecran, două ore pe zi, arată ca o eroare, nu ca un accent.

Sub 900px coloana de navigație devine sertar care intră din dreapta, cu buton în colț. Se închide la
Escape, la atingerea zonei umbrite și la orice schimbare de rută. Pentru utilizatorii care au cerut
mișcare redusă, sertarul se estompează pe loc în loc să alunece; indicatorul de încărcare continuă
totuși să se rotească, pentru că el e feedback, nu decor.

Harta rămâne în culorile ei. Dalele OpenStreetMap sunt informație, iar trecerea lor în tonuri de gri a
fost încercată și respinsă.

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

Peste asta se adaugă conținut scris de mână, realist ca ton și fără date personale copiate de undeva:
8 utilizatori, 5 categorii de forum cu 20 de postări și comentarii, 16 anunțuri, 5 evenimente și cele
14 articole despre drepturi.

## Securitate

O trecere completă a fost făcută înainte de punerea pe server. **Douăsprezece teste de securitate**
țin comportamentele de mai jos pe loc: nu sunt afirmații din documentație, sunt aserțiuni care sparg
build-ul dacă cineva le strică.

| Zonă | Ce e implementat |
|---|---|
| Sesiuni | id nou la fiecare login, deci un id plantat înainte de autentificare nu supraviețuiește; logout distruge rândul din baza de date, nu doar cookie-ul din browser |
| Cont blocat sau anonimizat | sesiunea se distruge la următoarea cerere |
| Cookie | `httpOnly`, `sameSite=lax`, `secure` în producție, prefix `__Host-` |
| CSRF | double submit legat de id-ul sesiunii, aplicat înaintea autentificării |
| Parole | argon2id, cost egal și mesaj identic pentru parolă greșită și cont inexistent |
| Roluri | verificare ierarhică în server, la fiecare rută protejată |
| Proprietate | fiecare modificare și ștergere verifică autorul în server |
| Referințe directe | o notificare sau un rând al altcuiva întorc 404, nu conținut străin |
| SQL | totul prin Prisma sau prin interogări parametrizate; nicio concatenare de string-uri |
| XSS | React escapează tot, iar inserarea de HTML brut nu apare nicăieri în cod |
| Antete | `helmet` pe API; politică de securitate a conținutului, `frame-ancestors 'none'`, `form-action 'self'` și HSTS pe răspunsurile reale |
| Email | nu iese niciodată prin API; două teste verifică literal răspunsurile |
| Jurnale | cookie-urile, antetul de autorizare și orice câmp de tip parolă sunt redactate |
| Secrete | nicio parolă nu există ca literal în cod; fișierele de mediu sunt excluse din git și verificate pe tot istoricul |

Limitele de trafic sunt pe niveluri, nu una singură:

| Limită | Prag | Pe ce |
|---|---|---|
| globală | 100 pe minut | tot API-ul |
| login | 5 la 15 minute | doar încercările eșuate |
| scriere | 10 pe minut | tot ce creează conținut nou |
| voturi | 30 pe minut | un vot e un click, 10 ar deranja un om real |
| căutare | 30 pe minut | cele mai scumpe citiri din aplicație |
| import de orar | 5 la 15 minute | o rulare parcurge tot orarul |

Editările și ștergerile pe rânduri care există deja și îți aparțin rămân doar sub limita globală: sunt
mărginite oricum de cât conținut ai, iar un prag strict ar bloca un moderator care rezolvă
cincisprezece rapoarte într-un minut.

Două lucruri găsite și reparate merită menționate, pentru că amândouă anulau tăcut o protecție:

Cheia de rate limit citea un antet trimis de client fără nicio condiție. Pe un server expus, oricine
îl falsifica primea o găleată nouă la fiecare cerere, adică nicio limită, exact la login și la
căutare. Acum antetul se crede doar când e pornit explicit, iar implicit e stins. Verificat pe serverul
care rulează: limita de căutare se aprinde exact la a 31-a cerere într-un minut, iar cu găleata
epuizată un antet falsificat primește tot 429.

Al doilea: parolele conturilor de prezentare erau valori implicite scrise în cod, deci publice, una
fiind de administrator. Acum seed-ul le cere din mediu, cu minimum 12 caractere, iar verificarea se
face înainte de a goli vreo tabelă.

Backup-ul și restaurarea au fost probate pe date reale: dump, apoi ștergere deliberată a 20 de postări,
833 de ore de orar și 6 utilizatori, apoi restaurare. Baza a revenit la exact aceleași cifre și
aplicația a pornit peste ea.

## Teste

**179 de teste, toate trec.** 173 în API (20 de fișiere) și 6 pe funcțiile comune de normalizare.

| Fel | Câte | Ce acoperă |
|---|---|---|
| unitare | 50 | parserul CSV, parserul XLSX pe fișierul real, diff-ul de orar, generatorul de ocurențe, exportul `.ics`, normalizarea textului |
| de pornire | 10 | flagurile și refuzurile de la boot, fără bază de date |
| de integrare | 119 | fluxurile complete ale fiecărui modul |

Testele de integrare nu folosesc mock-uri: pornesc aplicația și lovesc un PostgreSQL real, prin HTTP,
cu sesiune și token CSRF, ca un browser.

Ce verifică, pe scurt: fluxul de autentificare și cel de identitate instituțională; importerul cu
diff, notificări, dezactivare, sursă goală și supapa de 30%; parsarea fișierului real al facultății;
căutarea de săli; calendarul cu paritate, vacanțe, intervale de săptămâni, semigrupă și schimbarea orei
de toamnă; forumul cu voturi prin trigger, numărătoarea comentariilor, sortare, ștergere logică și
drepturi; anunțurile cu cereri, notificări, statusuri și drepturi; izolarea notificărilor între
utilizatori; evenimentele cu înscriere idempotentă și apariție în calendar; drepturile cu căutare fără
diacritice; moderarea cu raport dublu, raport pe propriul conținut, coadă închisă studenților și
ștergere cu notificare; termenele cu izolare între grupe; căutarea globală pe trei surse.

Pe lângă teste, aplicația a fost parcursă manual în browser, pe ambele teme, cu conturile de
prezentare: harta cu cele 10 clădiri, căutarea „lab retele" fără diacritice, orarul, calendarul,
termenele adăugate din interfață, forumul cu voturi și răspunsuri imbricate, o cerere de contact ajunsă
ca notificare fără nicio adresă de email, înscrierea la evenimente, coada de moderare ca moderator și
403 ca student, exportul `.ics` (128 de evenimente pentru grupa 1306) și importul de orar prin ecranul
de admin, cu fișierul real: 1667 de activități citite, zero erori.

Autentificarea instituțională a fost probată cap la cap cu un cont TUIASI real, din producție.

