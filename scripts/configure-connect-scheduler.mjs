import {readFileSync} from 'node:fs';
const project=process.env.HK_EXPECTED_NEON_PROJECT,key=process.env.NEON_API_KEY?.trim().replace(/^Bearer\s+/i,'');
if(!project||!key||process.env.APP_BASE_URL!=='https://healthkey-connect.vercel.app')throw Error('Missing scoped management configuration.');
const api='https://console.neon.tech/api/v2';
async function call(path,method='GET',body){const res=await fetch(api+path,{method,headers:{Authorization:`Bearer ${key}`,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body?body instanceof FormData?body:JSON.stringify(body):undefined});if(!res.ok){const detail=await res.json().catch(()=>({}));let message=String(detail.message??detail.error??detail.code??'No reason supplied').slice(0,600);for(const value of [key,process.env.CRON_SECRET])if(value)message=message.replaceAll(value,'[redacted]');console.log('Scheduler API blocked',method,path,res.status,message);throw Error('Scheduler configuration unavailable');}return res.status===204?{}:res.json();}
const result=await call(`/projects/${project}/branches`);const branch=result.branches.find(b=>b.default)||result.branches.find(b=>b.primary)||result.branches[0];if(!branch)throw Error('Missing branch.');
const prefix=`/projects/${project}/branches/${branch.id}`;
const form=new FormData();form.append('zip',new Blob([readFileSync('functions/retention.zip')]),'function.zip');form.append('runtime','nodejs24');form.append('environment',JSON.stringify({HEALTHKEY_CLEANUP_URL:process.env.APP_BASE_URL+'/api/internal/cleanup',HEALTHKEY_CRON_SECRET:process.env.CRON_SECRET}));
await call(prefix+'/functions/healthkeyretention/deployments','POST',form);
for(let i=0;i<20;i++){const data=await call(prefix+'/functions/healthkeyretention');const fn=data.function??data;const status=fn.current_deployment?.status;if(status==='completed')break;if(status==='failed')throw Error('Scheduler function deployment failed');await new Promise(r=>setTimeout(r,2500));}
const existing=await call(prefix+'/triggers');const trigger=existing.triggers?.find(t=>t.name==='healthkey-hourly-retention');if(!trigger)await call(prefix+'/triggers','POST',{type:'schedule',function_slug:'healthkeyretention',name:'healthkey-hourly-retention',schedule:{cron:'17 * * * *'},function_path:'/',enabled:true});
console.log('Configured hourly Neon retention trigger; all times UTC.');
