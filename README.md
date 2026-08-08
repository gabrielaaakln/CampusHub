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

## Datele

PostgreSQL 16, 30 de tabele, 16 tipuri enumerate. Câteva lucruri care nu sunt evidente:

- căutarea merge printr-o configurație proprie care ignoră diacriticele și aplică stemming românesc,
  plus indexuri trigram pentru potrivirea aproximativă;
- scorurile de la voturi și numărul de comentarii sunt întreținute de trigger-e, nu de aplicație;
- ștergerea e logică peste tot unde firul discuției sau istoricul contează;
- coloanele normalizate (fără diacritice, minuscule) există separat de forma de afișare, iar aceeași
  funcție de normalizare se folosește și la scriere, și la citire.
