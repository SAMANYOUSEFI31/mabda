/**
 * Builds the long-use sample «زندگی من» into a database file (or the one DATABASE_URL names).
 *   bun run seed:life                        → the local person, today
 *   bun run seed:life -- --user <id>         → one signed-in person (the id of /api/owner's list of people)
 * Rebuilds in place: the person's «زندگی من» space is replaced. Nothing else of theirs is touched.
 */
import { openDatabase } from '../server/db/database.ts';
import { Repo } from '../server/db/repo.ts';
import { applyLifeSample } from '../server/db/lifeSample/index.ts';
import { LOCAL_USER } from '../server/auth/http.ts';

const args = process.argv.slice(2);
const user = args.includes('--user') ? args[args.indexOf('--user') + 1] : LOCAL_USER;
if (!user) { console.error('--user needs an id'); process.exit(1); }
const db = openDatabase();
const ws = await applyLifeSample(new Repo(db), user, new Date());
console.log(`✓ «${ws.name}» (${ws.id}) is ready for ${user}`);
process.exit(0);
