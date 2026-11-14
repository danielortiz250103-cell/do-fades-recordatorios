import {getAdmin} from './_firebase.mjs';
export const config={schedule:'* * * * *'};
const TZ='America/Bogota';
function localParts(date){const p=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);return Object.fromEntries(p.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));}
function addDays(dateString,n){const [y,m,d]=dateString.split('-').map(Number);const dt=new Date(Date.UTC(y,m-1,d+n));return dt.toISOString().slice(0,10);}
function localDateTime(date,time){return new Date(`${date}T${time}:00-05:00`);}
async function sendToOwner(admin,db,uid,title,body,tag){
 const devices=await db.collection('devices').where('ownerUid','==',uid).get();
 const tokens=devices.docs.map(d=>d.data().token).filter(Boolean);
 if(!tokens.length)return;
 const chunks=[];for(let i=0;i<tokens.length;i+=500)chunks.push(tokens.slice(i,i+500));
 for(const group of chunks){
  const result=await admin.messaging().sendEachForMulticast({tokens:group,notification:{title,body},webpush:{notification:{icon:'/icon-192.png',badge:'/icon-192.png',tag},fcmOptions:{link:process.env.SITE_URL||'/'}}});
  result.responses.forEach((r,i)=>{if(!r.success && ['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(r.error?.code)){const bad=group[i];db.collection('devices').where('token','==',bad).get().then(s=>s.forEach(d=>d.ref.delete())).catch(()=>{});}});
 }
}
export default async ()=>{
 const admin=getAdmin(),db=admin.firestore(),now=new Date(),p=localParts(now),today=`${p.year}-${p.month}-${p.day}`,tomorrow=addDays(today,1);
 const snap=await db.collection('appointments').where('date','>=',today).where('date','<=',tomorrow).get();
 const docs=snap.docs;
 // Resumen general: se envía una sola vez por usuario y fecha, alrededor de las 8 p. m. de Colombia.
 if(Number(p.hour)===20 && Number(p.minute)<=4){
  const byOwner=new Map();
  for(const d of docs){const a=d.data();if(a.date===tomorrow){if(!byOwner.has(a.ownerUid))byOwner.set(a.ownerUid,[]);byOwner.get(a.ownerUid).push(a);}}
  for(const [uid,items] of byOwner){
   const digestId=`${uid}_${tomorrow}`;const digestRef=db.collection('digests').doc(digestId);const sent=await digestRef.get();if(sent.exists)continue;
   items.sort((a,b)=>a.time.localeCompare(b.time));
   const lines=items.slice(0,7).map(a=>`${a.time} ${a.client} (${a.service})`);
   const extra=items.length>7?` y ${items.length-7} más`:'';
   await sendToOwner(admin,db,uid,`Mañana tienes ${items.length} ${items.length===1?'turno':'turnos'}`,lines.join(' · ')+extra,`digest-${tomorrow}`);
   await digestRef.set({ownerUid:uid,date:tomorrow,sentAt:admin.firestore.FieldValue.serverTimestamp()});
  }
 }
 // Avisos individuales: 30 minutos antes y a la hora exacta.
 for(const d of docs){
  const a=d.data(),target=localDateTime(a.date,a.time),diff=(target-now)/60000;
  if(diff>=29 && diff<=31 && !a.sent30m){
   await sendToOwner(admin,db,a.ownerUid,`Cita en 30 minutos: ${a.client}`,`${a.time} · ${a.service}`,`before-${d.id}`);
   await d.ref.update({sent30m:true});
  }
  if(diff<=0 && diff>=-2 && !a.sentAtTime){
   await sendToOwner(admin,db,a.ownerUid,`Es la hora del turno: ${a.client}`,`${a.time} · ${a.service}`,`now-${d.id}`);
   await d.ref.update({sentAtTime:true});
  }
 }
};
