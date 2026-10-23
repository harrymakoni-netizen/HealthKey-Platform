// Synthetic fixtures only; callable by local setup or an explicitly bound new-project bootstrap.
export async function seedUpgrade(c){
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
 await c.query("UPDATE hk.clinics SET name=CASE WHEN id=$1 THEN 'Harbour Demo Access Centre' ELSE 'Bridge Demo Support Centre' END,settings=jsonb_set(jsonb_set(settings,'{languages}','[\"en\",\"nd\",\"zu\",\"xh\",\"af\"]'),'{name}',to_jsonb(CASE WHEN id=$1 THEN 'Harbour Demo Access Centre'::text ELSE 'Bridge Demo Support Centre'::text END)) WHERE id IN($1,$2)",[a,b]);
 for(const [id,cid,name,categories,languages,age,availability,protectedLocation] of [
 ['a1111111-1111-4111-8111-111111111111',a,'Harbour Demo Access Centre',['private_conversation','health_support','unsure'],['en','nd'],0,'accepting',false],
 ['b2222222-2222-4222-8222-222222222222',b,'Bridge Demo Support Centre',['private_conversation','health_support','counselling','legal_information','unsure'],['en','zu','xh','af'],0,'accepting',false],
 ['c3333333-3333-4333-8333-333333333333',b,'Cedar Demo Referral Pathway',['counselling','unsure'],['en'],20,'unknown',true]
 ])await c.query(`INSERT INTO hk.provider_listings(id,clinic_id,public_name,categories,area,public_pathway,provider_languages,access_requirements,accessibility,costs,identity_checked_at,identity_source,details_confirmed_at,availability,availability_expires_at,monitored,protected_location,public_approved) VALUES($1,$2,$3,$4,'Demo district','In-app referral only — fictional provider',$5,'adults','step_free','free',now(),'synthetic_fixture_only',now()-make_interval(days=>$6),$7,now()+interval '2 hours',true,$8,true) ON CONFLICT(id) DO NOTHING`,[id,cid,name,categories,languages,age,availability,protectedLocation]);
 // Canonical translations of approved synthetic service descriptions. Legacy Shona labels are retained in the DB only.
 const translations={other_private:{en:['Another private matter','Speak privately with a staff member'],nd:['Ingxoxo eyimfihlo','Khuluma ngasese lochwepheshe onikiweyo'],zu:['Ingxoxo yangasese','Khuluma ngasese nochwepheshe owabelwe'],xh:['Incoko yabucala','Thetha ngasese nengcali eyabelweyo'],af:['Private gesprek','Praat privaat met ’n toegewese praktisyn']},sexual_health:{en:['Sexual health','STI, HIV and sexual health support'],nd:['Usizo lwezempilo','Usizo lwezocansi, i-STI le-HIV'],zu:['Usizo lwezempilo','Usizo lwezocansi, i-STI ne-HIV'],xh:['Inkxaso yezempilo','Inkxaso yezempilo yezesondo, i-STI ne-HIV'],af:['Gesondheidsondersteuning','Ondersteuning vir seksuele gesondheid, SOI’s en MIV']}};
 for(const [key,langs] of Object.entries(translations))for(const [locale,[label,help]] of Object.entries(langs))await c.query('UPDATE hk.services SET labels=jsonb_set(labels,ARRAY[$1],to_jsonb($2::text)),help=jsonb_set(help,ARRAY[$1],to_jsonb($3::text)) WHERE key=$4',[locale,label,help,key]);
}

export async function seedRouting(c){
 const rows=[['private_conversation','Private conversation','Ingxoxo eyimfihlo','Ingxoxo yangasese','Incoko yabucala','Private gesprek'],['health_support','Health support','Usizo lwezempilo','Usizo lwezempilo','Inkxaso yezempilo','Gesondheidsondersteuning'],['counselling','Counselling','Ukwelulekwa','Ukwelulekwa','Ingcebiso nenkxaso','Berading'],['legal_information','Legal information','Ulwazi lomthetho','Ulwazi lwezomthetho','Ulwazi lwezomthetho','Regs inligting'],['unsure','I’m unsure','Angiqiniseki','Angiqiniseki','Andiqinisekanga','Ek is onseker']];
 for(const cid of ['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'])for(const [i,row]of rows.entries()){
 const labels=Object.fromEntries(['en','nd','zu','xh','af'].map((l,j)=>[l,row[j+1]]));
 await c.query("INSERT INTO hk.services(clinic_id,key,icon,sort_order,labels,help) VALUES($1,$2,'message',$3,$4,$4) ON CONFLICT(clinic_id,key) DO NOTHING",[cid,row[0],20+i,labels]);
 }
}
