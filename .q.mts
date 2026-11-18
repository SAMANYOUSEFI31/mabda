import { openDatabase } from './server/db/database.ts';
import { Repo } from './server/db/repo.ts';
import { candidatePairs } from './src/core/contradictionCandidates.ts';
const repo = new Repo(openDatabase('/tmp/life.sqlite'));
const s={userId:'local',workspaceId:'ws_course'}; const st=repo.state(s);
for (const p of candidatePairs(st.objects,10,st.relationships,st.nodes,new Date())) console.log(p.a.title,'|',p.a.content.slice(0,50),'||',p.b.title,'|',p.b.content.slice(0,50),p.reasons);
