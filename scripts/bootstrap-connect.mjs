// Operator-only: first-time setup of a NEW, independently provisioned synthetic Neon project.
import {Pool} from 'pg';
import {readFileSync,readdirSync} from 'node:fs';
import {betterAuth} from 'better-auth';
import {getMigrations} from 'better-auth/db/migration';
import {seedUpgrade,seedRouting} from './seed-upgrade.mjs';
const url=new URL(process.env.HK_CONNECT_MIGRATION_URL??'');
if(process.env.DEMO_MODE!=='true'||!url.hostname.endsWith('.neon.tech')||!process.env.HK_EXPECTED_NEON_PROJECT||process.env.APP_BASE_URL!=='https://healthkey-connect.vercel.app')throw Error('Explicit new demo target required.');
const pool=new Pool({connectionString:url.toString(),max:1,connectionTimeoutMillis:20000});
const c=await pool.connect();
let authPool;
try{
 await c.query('BEGIN');
 if(!(await c.query("SELECT to_regclass('hk.clinics') t")).rows[0].t){for(const file of readdirSync('database').filter(f=>/^\d{3}.*\.sql$/.test(f)).sort())await c.query(readFileSync('database/'+file,'utf8'));}
 if(!(await c.query("SELECT to_regclass('hk.creation_contracts') t")).rows[0].t)await c.query(readFileSync('database/012_view_and_integrity.sql','utf8'));
 if(!(await c.query("SELECT to_regprocedure('hk.cleanup_content()') t")).rows[0].t)await c.query(readFileSync('database/013_hourly_retention.sql','utf8'));
 if(!(await c.query("SELECT to_regclass('hk.referral_outcomes') t")).rows[0].t)await c.query(readFileSync('database/014_status_tombstones.sql','utf8'));
 for(const [role,key]of [['healthkey_app','HK_APP_PASSWORD'],['healthkey_maintenance','HK_MAINTENANCE_PASSWORD'],['healthkey_auth','HK_AUTH_PASSWORD']]){
 const value=process.env[key];if(!/^[a-f0-9]{48}$/.test(value??''))throw Error('Missing role credential.');
 await c.query(`DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} LOGIN; END IF; END $$`);
 await c.query(`ALTER ROLE ${role} PASSWORD '${value}'`);
 }
 const {settings,services}=JSON.parse(readFileSync('database/demo-config.json','utf8'));
 for(const [id,code]of [['11111111-1111-4111-8111-111111111111','HK001'],['22222222-2222-4222-8222-222222222222','HK002']]){
 await c.query('INSERT INTO hk.clinics(id,code,name,settings) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[id,code,'Synthetic demo centre',{...settings,languages:['en','nd','zu','xh','af']}]);
 for(const [i,s]of services.entries())await c.query("INSERT INTO hk.services(clinic_id,key,icon,sort_order,labels,help) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",[id,s[0],s[1],i,{en:s[2],nd:s[4],sn:s[3]},{en:s[5],nd:s[7],sn:s[6]}]);
 }
 await seedUpgrade(c);await seedRouting(c);
 await c.query('CREATE SCHEMA IF NOT EXISTS hk_auth');
 await c.query('COMMIT');
 authPool=new Pool({connectionString:url.toString(),options:'-c search_path=hk_auth,public',max:1});
 const authOptions={baseURL:process.env.APP_BASE_URL,basePath:'/api/staff-identity',secret:process.env.NEON_AUTH_COOKIE_SECRET,database:authPool,emailAndPassword:{enabled:true},advanced:{database:{generateId:'uuid'}},rateLimit:{enabled:true,storage:'database'},logger:{disabled:true}};
 await(await getMigrations(authOptions)).runMigrations();
 const auth=betterAuth(authOptions);
 for(const [key,role,cid]of [['intake','intake',1],['clinician','clinician',1],['admin','admin',1],['receiving','clinician',2],['secondadmin','admin',2],['verifier','verifier',1],['platform','platform',1]]){
 const email=key+'@healthkey-connect.test';let user=(await authPool.query('SELECT id FROM "user" WHERE email=$1',[email])).rows[0];
 if(!user)user=(await auth.api.signUpEmail({body:{email,password:process.env.HK_DEMO_PASSWORD,name:'Demo '+key}})).user;
 await c.query('INSERT INTO hk.staff_users(id,clinic_id,name,role) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[user.id,cid===1?'11111111-1111-4111-8111-111111111111':'22222222-2222-4222-8222-222222222222','Demo '+key,role]);
 }
 await c.query('GRANT USAGE ON SCHEMA hk_auth TO healthkey_auth');await c.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA hk_auth TO healthkey_auth');
 await c.query('GRANT USAGE ON ALL SEQUENCES IN SCHEMA hk_auth TO healthkey_auth');
 await c.query('SELECT hk.cleanup()');
 console.log('Isolated synthetic database, restricted application/auth roles and seven staff accounts provisioned.');
} catch(e){await c.query('ROLLBACK').catch(()=>{});console.error('Bootstrap failed',e.code??e.name);process.exitCode=1;} finally{c.release();await authPool?.end();await pool.end();}
