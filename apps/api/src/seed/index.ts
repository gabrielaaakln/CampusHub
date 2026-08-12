import { prisma } from '../lib/db.js';
import { seedCampus } from './campus.js';
import { seedSchedule } from './schedule.js';
import {
  DEMO_ADMIN_EMAIL,
  DEMO_STUDENT_EMAIL,
  assertDemoPasswords,
  seedCommunity,
} from './community.js';

// the list must stay complete a missing table keeps stale rows across reseeds
const TABLES = [
  'faculties',
  'study_groups',
  'subjects',
  'subject_aliases',
  'academic_terms',
  'academic_breaks',
  'users',
  'email_tokens',
  'user_sessions',
  'buildings',
  'floors',
  'rooms',
  'room_aliases',
  'schedule_entries',
  'scrape_runs',
  'schedule_changes',
  'deadlines',
  'forum_categories',
  'forum_posts',
  'forum_comments',
  'post_votes',
  'comment_votes',
  'listings',
  'listing_images',
  'listing_requests',
  'events',
  'event_attendees',
  'rights_articles',
  'reports',
  'notifications',
];

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW_PROD !== 'yes') {
    throw new Error('Refusing to wipe a production database. Set SEED_ALLOW_PROD=yes if you mean it.');
  }
  assertDemoPasswords();

  console.log('clearing existing data');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);

  const { faculty, term, groups, subjects, rooms } = await seedCampus();
  console.log(`faculty ${faculty.shortName}, term ${term.academicYear} sem ${term.semester}`);
  console.log(
    `  ${groups.length} groups, ${subjects.length} subjects, ${rooms.roomCount} rooms in ${rooms.buildings.length} buildings`,
  );

  const report = await seedSchedule({
    id: term.id,
    facultyId: faculty.id,
    academicYear: term.academicYear,
    semester: term.semester,
  });
  console.log(`  schedule run ${report.runId}: ${report.added} entries, status ${report.status}`);
  if (report.unresolvedSubjects.length > 0) {
    console.log(`  unresolved subjects: ${report.unresolvedSubjects.join(', ')}`);
  }
  for (const error of report.errors) console.log(`  ! ${error}`);

  const roomIds = await prisma.room
    .findMany({ where: { roomType: 'curs' }, select: { id: true } })
    .then((r) => r.map((x) => x.id));

  // the demo accounts sit in third year groups so their week is full
  const demoGroups = ['1306', '1307', '1308']
    .map((name) => groups.find((g) => g.name === name))
    .filter((g) => g !== undefined);

  await seedCommunity({
    facultyId: faculty.id,
    groupIds: (demoGroups.length > 0 ? demoGroups : groups).map((g) => g.id),
    roomIds,
  });
  console.log('two accounts can sign in with a password the rest are authors only');
  console.log(`  admin   ${DEMO_ADMIN_EMAIL}`);
  console.log(`  student ${DEMO_STUDENT_EMAIL}`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
