# Informare privind prelucrarea datelor

Document publicat și ca pagină în aplicație, la `/confidentialitate`.

## Ce date colectăm

| Data | De ce | Temei |
|---|---|---|
| Nume afișat | identificare în forum și anunțuri | executarea serviciului |
| Adresa de email instituțională | crearea contului, autentificare | executarea serviciului |
| Grupa și semigrupa (opțional) | filtrarea orarului și a deadline-urilor | executarea serviciului |
| Conținutul postat: postări, comentarii, anunțuri, cereri de contact | funcționarea platformei | executarea serviciului |
| Jurnale tehnice de acces | depanare și securitate | interes legitim |

Nu cerem data nașterii, CNP-ul, adresa de domiciliu sau numărul de telefon.

## Cine vede ce

- Adresele de email **nu se expun niciodată prin API**, nici altor studenți, nici moderatorilor.
  Contactul între studenți trece prin cererile de la anunțuri.
- Postările și anunțurile sunt vizibile utilizatorilor autentificați din facultate.
- Moderatorii văd conținutul raportat și autorul afișat, nu și datele de contact.

## Orarul și numele cadrelor didactice

Orarul importat conține nume de cadre didactice, preluate din sursa oficială a facultății. Sunt date
personale republicate; temeiul este interesul legitim de a face orarul utilizabil pentru studenți. La
cerere, un nume poate fi eliminat din afișare.

## Rapoartele de moderare

Un raport păstrează motivul scris de cel care raportează, ținta și contul autorului raportului —
ultimul, ca aceeași persoană să nu raporteze de două ori aceeași țintă. **Identitatea celui care
raportează nu ajunge niciodată la autorul conținutului**: acesta primește doar o notificare că
materialul a fost șters.

Rapoartele sunt vizibile moderatorilor și rămân în coadă și după rezolvare, ca decizia să poată fi
verificată ulterior. Anonimizarea contului rupe legătura dintre raport și persoană, dar nu șterge
raportul.

## Cât păstrăm

- Contul și conținutul, cât timp contul există.
- Jurnalele tehnice, 30 de zile.
- Sesiunile expiră după 30 de zile de inactivitate.

## Ștergerea contului

Butonul din profil face **anonimizare**, nu ștergere fizică: numele devine „Utilizator șters”, adresa
de email este înlocuită cu o valoare aleatoare fără valoare de contact, parola se șterge, iar data
anonimizării se înregistrează. Postările rămân fără autor, ca firele de discuție să nu se rupă.
Efectul este imediat și nu necesită cerere prin email.

## Imagini încărcate

**Aplicația nu acceptă încă încărcarea de imagini**; flag-ul `uploads` este stins. Când va accepta,
fișierele se verifică după conținutul real, nu după extensie, se **re-encodează** în jpeg sau webp,
metadatele EXIF — inclusiv locația — se elimină, iar numele fișierului pe disc este aleatoriu.

## Reguli de conținut

Anunțurile care privesc redactarea de lucrări sau proiecte la comandă sunt interzise, la fel ca
bunurile restricționate. Încălcarea duce la ștergerea anunțului.

## Drepturile tale

Acces, rectificare, ștergere, opoziție și portabilitate. Cele două care se exercită în practică nu
trec prin nimeni: datele se schimbă din profil, iar contul se șterge tot de acolo, imediat.
