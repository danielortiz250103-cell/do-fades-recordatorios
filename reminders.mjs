import {getAdmin} from './_firebase.mjs';

export const config={schedule:'* * * * *'};
const TZ='America/Bogota';
function localParts(date){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  return Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
}
function addDays(dateString,n){
  const [y,m,d]=dateString.split('-').map(Number);
  return new Date(Date.UTC(y,m-1,d+n)).toISOString().slice(0,10);
}
function localDateTime(date,time){return new Date(`${date}T${time}:00-05:00`);}
async function sendToOwner(admin,db,uid,title,body,tag){
  const devices=await db.collection('devices').where('ownerUid','==',uid).get();
  const tokens=devices.docs.map(d=>d.data().token).filter(Boolean);
  if(!tokens.length)return false;
  let sent=false;
  for(let i=0;i<tokens.length;i+=500){
    const group=tokens.slice(i,i+500);
    const result=await admin.messaging().sendEachForMulticast({
      tokens:group,
      notification:{title,body},
      webpush:{notification:{icon:'/icon-192.png',tag},fcmOptions:{link:process.env.SITE_URL||'/'}}
    });
    if(result.successCount>0)sent=true;
    const invalid=[];
    result.responses.forEach((response,index)=>{
      if(!response.success&&['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(response.error?.code))invalid.push(group[index]);
    });
    for(const token of invalid){
      const stale=await db.collection('devices').where('token','==',token).get();
      const batch=db.batch();stale.forEach(doc=>batch.delete(doc.ref));await batch.commit();
    }
  }
  return sent;
}

export default async ()=>{
  const admin=getAdmin(),db=admin.firestore(),now=new Date();
  const p=localParts(now),today=`${p.year}-${p.month}-${p.day}`,tomorrow=addDays(today,1);
  const snapshot=await db.collection('appointments').where('date','>=',today).where('date','<=',tomorrow).get();
  const docs=snapshot.docs;

  // Resumen general de mañana: una sola notificación por usuario, a las 8 p. m. de Colombia.
  if(Number(p.hour)===20&&Number(p.minute)<=4){
    const byOwner=new Map();
    for(const doc of docs){
      const appointment=doc.data();
      if(appointment.date===tomorrow){
        if(!byOwner.has(appointment.ownerUid))byOwner.set(appointment.ownerUid,[]);
        byOwner.get(appointment.ownerUid).push(appointment);
      }
    }
    for(const [uid,items] of byOwner){
      const digestRef=db.collection('digests').doc(`${uid}_${tomorrow}`);
      if((await digestRef.get()).exists)continue;
      items.sort((a,b)=>a.time.localeCompare(b.time));
      const lines=items.slice(0,7).map(a=>`${a.time} ${a.client} (${a.service})`);
      const extra=items.length>7?` y ${items.length-7} más`:'';
      const sent=await sendToOwner(admin,db,uid,`Mañana tienes ${items.length} ${items.length===1?'cita':'citas'}`,lines.join(' · ')+extra,`digest-${tomorrow}`);
      if(sent)await digestRef.set({ownerUid:uid,date:tomorrow,sentAt:admin.firestore.FieldValue.serverTimestamp()});
    }
  }

  // Recordatorios individuales: 30 minutos antes y al llegar la hora.
  for(const doc of docs){
    const appointment=doc.data();
    const target=localDateTime(appointment.date,appointment.time);
    const difference=(target-now)/60000;
    if(difference>=29&&difference<=31&&!appointment.sent30m){
      const sent=await sendToOwner(admin,db,appointment.ownerUid,`Cita en 30 minutos: ${appointment.client}`,`${appointment.time} · ${appointment.service}`,`before-${doc.id}`);
      if(sent)await doc.ref.update({sent30m:true});
    }
    if(difference<=0&&difference>=-2&&!appointment.sentAtTime){
      const sent=await sendToOwner(admin,db,appointment.ownerUid,`Es la hora de la cita: ${appointment.client}`,`${appointment.time} · ${appointment.service}`,`now-${doc.id}`);
      if(sent)await doc.ref.update({sentAtTime:true});
    }
  }
};
