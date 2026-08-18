import argon2 from 'argon2';
import { DateTime } from 'luxon';
import { prisma } from '../lib/db.js';

/**
 * only two accounts can be signed into with a password
 *
 * the rest of the people exist so the forum and the listings have different names on them but they
 * carry no password hash at all which verifyCredentials treats as no account there is no third way
 * in besides the institutional sign in
 */
export const DEMO_ADMIN_EMAIL = 'admin@tuiasi.ro';
export const DEMO_STUDENT_EMAIL = 'student@student.tuiasi.ro';

const MIN_DEMO_PASSWORD = 12;

/**
 * no password literal lives in this repository not even a development one
 *
 * a value written here is public the moment the repository is, and an administrator account with a
 * published password is the whole application handed over, so both come from the environment
 */
function demoPassword(variable: string): string {
  const given = process.env[variable]?.trim();
  if (!given) {
    throw new Error(
      `${variable} is not set. Demo passwords live in .env, never in the repository — see .env.example`,
    );
  }
  if (given.length < MIN_DEMO_PASSWORD) {
    throw new Error(`${variable} must be at least ${MIN_DEMO_PASSWORD} characters`);
  }
  return given;
}

/** called before the truncate: a seed that empties the database and only then complains is worse */
export function assertDemoPasswords(): void {
  demoPassword('DEMO_ADMIN_PASSWORD');
  demoPassword('DEMO_STUDENT_PASSWORD');
}

type Ids = { facultyId: number; groupIds: number[]; roomIds: number[] };

export async function seedCommunity({ facultyId, groupIds, roomIds }: Ids) {
  const hash = (plain: string) => argon2.hash(plain, { type: argon2.argon2id });
  const [adminHash, studentHash] = await Promise.all([
    hash(demoPassword('DEMO_ADMIN_PASSWORD')),
    hash(demoPassword('DEMO_STUDENT_PASSWORD')),
  ]);
  const group = (i: number) => groupIds[i % groupIds.length]!;

  // the acronyms come from the real timetable a post about transport gets no subject at all
  const byShortName = await prisma.subject
    .findMany({ where: { facultyId }, select: { id: true, shortName: true } })
    .then((rows) => new Map(rows.flatMap((r) => (r.shortName ? [[r.shortName, r.id] as const] : []))));
  const subjectOf = (short: string | null) => (short ? (byShortName.get(short) ?? null) : null);

  const people: {
    name: string;
    email: string;
    role: 'student' | 'moderator' | 'admin';
    g: number;
    sg: number;
    /** null means the account exists as an author but nobody can sign into it */
    passwordHash: string | null;
  }[] = [
    {
      name: 'Andrei Cojocaru',
      email: DEMO_ADMIN_EMAIL,
      role: 'admin',
      g: 0,
      sg: 1,
      passwordHash: adminHash,
    },
    {
      name: 'Ana Popa',
      email: DEMO_STUDENT_EMAIL,
      role: 'student',
      g: 0,
      sg: 1,
      passwordHash: studentHash,
    },
    // admin outranks moderator so the queue is reachable without a second password
    { name: 'Maria Ursu', email: 'moderator@tuiasi.ro', role: 'moderator', g: 0, sg: 2, passwordHash: null },
    { name: 'Vlad Munteanu', email: 'vlad.munteanu@student.tuiasi.ro', role: 'student', g: 0, sg: 2, passwordHash: null },
    { name: 'Ioana Stoica', email: 'ioana.stoica@student.tuiasi.ro', role: 'student', g: 1, sg: 1, passwordHash: null },
    { name: 'Robert Năstase', email: 'robert.nastase@student.tuiasi.ro', role: 'student', g: 1, sg: 2, passwordHash: null },
    { name: 'Elena Dobre', email: 'elena.dobre@student.tuiasi.ro', role: 'student', g: 2, sg: 1, passwordHash: null },
    { name: 'Tudor Ilie', email: 'tudor.ilie@student.tuiasi.ro', role: 'student', g: 2, sg: 2, passwordHash: null },
  ];

  const users = await Promise.all(
    people.map((p) =>
      prisma.user.create({
        data: {
          displayName: p.name,
          email: p.email,
          passwordHash: p.passwordHash,
          // the database refuses a local account with no password and mock is what these are
          authProvider: p.passwordHash ? 'local' : 'mock',
          emailVerified: true,
          role: p.role,
          facultyId,
          groupId: group(p.g),
          subgroup: p.sg,
        },
      }),
    ),
  );
  const author = (i: number) => users[i % users.length]!.id;

  const categories = await Promise.all(
    [
      { name: 'Anul 1', slug: 'anul-1', description: 'Întrebările de început, fără rușine.' },
      { name: 'Cursuri și laboratoare', slug: 'cursuri', description: 'Materiale, teme, laboratoare.' },
      { name: 'Examene și sesiune', slug: 'sesiune', description: 'Cum arată examenele, ce se cere.' },
      { name: 'Cămin și cazare', slug: 'camin', description: 'Cămine, chirii, colegi de cameră.' },
      { name: 'Timp liber', slug: 'timp-liber', description: 'Sport, concerte, ieșiri.' },
    ].map((c, i) => prisma.forumCategory.create({ data: { facultyId, position: i, ...c } })),
  );
  const category = (i: number) => categories[i % categories.length]!.id;

  const posts: [string, string, string | null][] = [
    [
      'Unde se ține laboratorul de rețele?',
      'Am găsit doar „A1-13” în orar. E la etajul 1 în Corp A (DAIA).',
      'SD3',
    ],
    [
      'Ce laptop îmi trebuie în anul 1?',
      'Orice mașină cu 8 GB RAM duce tot ce facem. Nu cumpărați nimic în prima lună.',
      null,
    ],
    [
      'Cum se punctează proiectul la Baze de Date?',
      'Proiect 40%, laborator 20%, examen 40%. Se pot lua puncte în plus pe optimizări.',
      'BD',
    ],
    [
      'Se poate schimba semigrupa?',
      'Da, la secretariat în primele două săptămâni, dacă există loc în cealaltă semigrupă.',
      null,
    ],
    [
      'Materiale pentru Sisteme de Operare',
      'Cursul e suficient pentru examen, dar laboratorul cere citit despre procese și semafoare.',
      'SO',
    ],
    [
      'Cine mai dă Metode numerice în toamnă?',
      'Se adună un grup de învățat în bibliotecă, în Corp AC, marți și joi de la 16.',
      'MN',
    ],
    [
      'Cămin sau chirie în anul 1?',
      'Căminul e mai ieftin și ești lângă cursuri. Chiria dă liniște, dar te muți mai greu.',
      null,
    ],
    [
      'Cât durează să iei permisul în Iași?',
      'În medie două luni, dacă prinzi programare repede la școala de șoferi.',
      null,
    ],
    [
      'Recomandări de opționale în anul 3',
      'Ingineria Programării ajută cel mai mult la primul interviu.',
      'IP',
    ],
    ['Se cere prezența la cursuri?', 'La curs, rar. La laborator, da, și se recuperează greu.', null],
    [
      'Ce fac dacă pierd o lucrare de laborator?',
      'Se recuperează în săptămâna de recuperări, cu acordul cadrului didactic.',
      null,
    ],
    [
      'Unde găsesc orarul oficial?',
      'Pe site-ul facultății, dar aici îl aveți deja importat și vă anunță când se schimbă.',
      null,
    ],
    [
      'Grup de studiu pentru Inteligență Artificială',
      'Ne vedem miercuri după curs în C2-6, aducem laptopurile.',
      'IAu',
    ],
    [
      'Cum mă înscriu la bursa socială?',
      'Dosarul se depune la secretariat în primele trei săptămâni de la începerea semestrului.',
      null,
    ],
    [
      'Există sală de sport pentru studenți?',
      'Da, cu legitimația de student, în intervalul de după-amiază.',
      null,
    ],
    [
      'Ce editor folosiți la Programarea Calculatoarelor?',
      'Orice, dar la examen se compilează din linia de comandă. Învățați asta din prima.',
      'PC2',
    ],
    ['Se poate da restanță și la laborator?', 'Nu, laboratorul se reface anul următor dacă nu îl treci.', null],
    ['Câte stagii de practică sunt?', 'Două, după anul 2 și după anul 3, câte 90 de ore fiecare.', null],
    ['Cum ajung de la gară la facultate?', 'Tramvaiul 1 oprește lângă campusul Tudor Vladimirescu, apoi mai sunt 10 minute pe jos.', null],
    [
      'Merită clubul de robotică?',
      'Da. Se lucrează pe proiecte reale și e cel mai simplu mod de a învăța practic.',
      null,
    ],
  ];

  const created = await Promise.all(
    posts.map(([title, content, short], i) =>
      prisma.forumPost.create({
        data: {
          categoryId: category(i),
          authorId: author(i + 2),
          subjectId: subjectOf(short),
          title: title!,
          content: content!,
          createdAt: DateTime.now()
            .minus({ days: posts.length - i, hours: i })
            .toJSDate(),
        },
      }),
    ),
  );

  // votes and comments exist so the triggers for score and comment_count have work to do
  for (const [i, post] of created.entries()) {
    const voters = users.slice(0, (i % 5) + 2);
    await prisma.postVote.createMany({
      data: voters.map((u, j) => ({
        userId: u.id,
        postId: post.id,
        value: j === 0 && i % 7 === 0 ? -1 : 1,
      })),
    });
    if (i % 3 === 0) {
      await prisma.forumComment.create({
        data: { postId: post.id, authorId: author(i + 1), content: 'Mulțumesc, exact asta căutam.' },
      });
      await prisma.forumComment.create({
        data: { postId: post.id, authorId: author(i + 4), content: 'Confirm, la fel a fost și anul trecut.' },
      });
    }
  }

  const listings: {
    kind: 'produs' | 'serviciu';
    title: string;
    description: string;
    price: number | null;
    unit?: string;
    subject?: string;
  }[] = [
    { kind: 'produs', title: 'Curs de Metode numerice, ediția 2024', description: 'Fără sublinieri, cotor intact.', price: 40 , subject: 'MN' },
    { kind: 'produs', title: 'Placă de dezvoltare STM32 și cabluri', description: 'Folosită un semestru la laborator.', price: 120 },
    { kind: 'produs', title: 'Monitor 24 inch, full HD', description: 'Două intrări HDMI, fără pixeli morți.', price: 350 },
    { kind: 'produs', title: 'Halat de laborator, mărimea M', description: 'Purtat de două ori.', price: 30 },
    { kind: 'produs', title: 'Set de cărți pentru anul 1', description: 'Matematici discrete, Programare, Electrotehnică. Se dau împreună.', price: 90 },
    { kind: 'produs', title: 'Multimetru digital', description: 'Cu sonde noi, verificat.', price: 75 },
    { kind: 'produs', title: 'Birou mic pentru cămin', description: 'Se demontează, încape în lift.', price: 100 },
    { kind: 'produs', title: 'Căști cu reducere de zgomot', description: 'Utile în sala de lectură.', price: 200 },
    { kind: 'serviciu', title: 'Meditații la Programarea Calculatoarelor', description: 'C și structuri de date, la mine sau online.', price: 60, unit: 'oră' , subject: 'PC2' },
    { kind: 'serviciu', title: 'Meditații la Metode numerice', description: 'Pregătire pentru restanța din toamnă.', price: 50, unit: 'oră' , subject: 'MN' },
    { kind: 'serviciu', title: 'Ajutor la configurat rețele pentru laborator', description: 'Explic subnetarea și rutarea statică.', price: 40, unit: 'oră' , subject: 'SD3' },
    { kind: 'serviciu', title: 'Tehnoredactare lucrări', description: 'Formatare în Word sau LaTeX. Nu scriu conținut.', price: 25, unit: 'lucrare' },
    { kind: 'serviciu', title: 'Transport bagaje la început de an', description: 'Dubă mică, în Iași și împrejurimi.', price: 80, unit: 'drum' },
    { kind: 'serviciu', title: 'Reparații laptopuri', description: 'Schimb pastă termoconductoare, curățare, upgrade SSD.', price: 70, unit: 'intervenție' },
    { kind: 'serviciu', title: 'Cursuri de conversație în engleză', description: 'Grup mic, marți și joi seara.', price: 35, unit: 'oră' },
  ];

  const createdListings = await Promise.all(
    listings.map((l, i) =>
      prisma.listing.create({
        data: {
          facultyId,
          authorId: author(i + 3),
          kind: l.kind,
          subjectId: subjectOf(l.subject ?? null),
          title: l.title,
          description: l.description,
          price: l.price,
          priceUnit: l.unit ?? null,
          status: i === 4 ? 'rezervat' : 'activ',
          createdAt: DateTime.now().minus({ days: listings.length - i }).toJSDate(),
        },
      }),
    ),
  );

  // the official link is what a student actually needs the summary only says what to look for
  const rights: [string, string, string, string | null][] = [
    ['Burse', 'Bursa de performanță', 'Se acordă pe baza mediei din anul precedent. Dosarul se depune la secretariat în primele trei săptămâni ale semestrului.', 'https://www.tuiasi.ro/studenti/burse/'],
    ['Burse', 'Bursa socială', 'Se acordă în funcție de venitul pe membru de familie. Actele necesare sunt în regulamentul de burse.', 'https://www.tuiasi.ro/studenti/burse/'],
    ['Burse', 'Bursa de ajutor social ocazional', 'Se cere o singură dată, pentru situații neprevăzute: deces în familie, boală, naștere. Nu depinde de medie.', null],
    ['Examinare', 'Contestația la examen', 'Se depune în 24 de ore de la afișarea rezultatului. Lucrarea se recorectează de o comisie.', null],
    ['Examinare', 'Reexaminarea', 'Fiecare disciplină poate fi susținută de două ori în sesiunile de restanțe, contra taxă după prima încercare.', null],
    ['Examinare', 'Mărirea de notă', 'Se poate susține o singură dată pe disciplină, iar ultima notă rămâne cea finală, chiar dacă e mai mică.', null],
    ['Cazare', 'Repartizarea în cămin', 'Criteriul principal este media, cu locuri rezervate pentru cazuri sociale.', 'https://www.tuiasi.ro/studenti/cazare/'],
    ['Cazare', 'Schimbarea camerei', 'Se cere la administrația căminului, în scris, iar mutarea se face dacă există loc liber.', null],
    ['Reprezentare', 'Studentul reprezentant', 'Fiecare grupă își alege un reprezentant care participă la ședințele de an.', null],
    ['Reprezentare', 'Studenții din consiliul facultății', 'Studenții au un sfert din locurile din consiliul facultății și vot la deciziile care îi privesc.', null],
    ['Practică', 'Stagiul de practică', 'Durata minimă este de 90 de ore pe stagiu și se poate face și la o firmă găsită de student.', null],
    ['Mobilități', 'Erasmus+', 'Selecția se face pe bază de dosar și de medie, iar disciplinele promovate în străinătate se recunosc integral.', 'https://www.tuiasi.ro/studenti/erasmus/'],
    ['Taxe', 'Taxa de studiu și eșalonarea', 'Taxa se poate plăti în rate, cu o cerere depusă la secretariat înainte de termenul primei rate.', null],
    ['Date personale', 'Accesul la propriile date', 'Poți cere secretariatului situația școlară și corectarea datelor greșite.', null],
  ];

  await Promise.all(
    rights.map(([category, title, summary, url], i) =>
      prisma.rightsArticle.create({
        data: { facultyId, category, title, summary, officialUrl: url, position: i },
      }),
    ),
  );

  const now = DateTime.now();
  const events: [string, string, number, number][] = [
    ['Hackathon AC', 'Două zile de lucru în echipe de câte patru.', 5, 0],
    ['Târg de practică și internship', 'Firme din Iași și București, discuții directe.', 9, 1],
    ['Seară de robotică', 'Demonstrații ale clubului de robotică.', 12, 2],
    ['Curs deschis: securitate web', 'Invitat din industrie, intrare liberă.', 16, 3],
    ['Turneu de fotbal între ani', 'Înscrierile se fac pe echipe.', 21, 4],
  ];

  const createdEvents = await Promise.all(
    events.map(([title, description, inDays, roomIdx]) =>
      prisma.event.create({
        data: {
          facultyId,
          createdBy: author(1),
          title,
          description,
          roomId: roomIds[roomIdx % roomIds.length] ?? null,
          startsAt: now.plus({ days: inDays }).set({ hour: 10, minute: 0 }).toJSDate(),
          endsAt: now.plus({ days: inDays }).set({ hour: 16, minute: 0 }).toJSDate(),
        },
      }),
    ),
  );

  // an event with zero attendees looks broken rather than new
  await prisma.eventAttendee.createMany({
    data: createdEvents.flatMap((event, i) =>
      users.slice(2, 2 + ((i % 4) + 2)).map((u) => ({ eventId: event.id, userId: u.id })),
    ),
  });

  await prisma.notification.createMany({
    data: users.slice(2).map((u) => ({
      userId: u.id,
      type: 'schedule_changed',
      title: 'Orarul grupei tale s-a schimbat',
      body: 'Un curs și-a schimbat sala față de importul anterior.',
      link: '/orar',
    })),
  });

  return {
    users: users.length,
    posts: created.length,
    listings: listings.length,
    events: createdEvents.length,
    rights: rights.length,
  };
}
