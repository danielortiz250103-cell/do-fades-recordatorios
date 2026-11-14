import {getAdmin,verifyUser,json} from './_firebase.mjs';
export default async (event)=>{
 if(event.httpMethod!=='POST') return json(405,{error:'Method not allowed'});
 try{
  const admin=getAdmin(), user=await verifyUser(event,admin), db=admin.firestore();
  const body=JSON.parse(event.body||'{}');
  if(!Array.isArray(body.appointments)) return json(400,{error:'Formato de citas inválido'});
  const incoming=body.appointments.slice(0,500);
  const collection=db.collection('appointments');
  const existing=await collection.where('ownerUid','==',user.uid).get();
  const keep=new Set(incoming.map(a=>String(a.id)));
  const batch=db.batch();
  for(const doc of existing.docs){if(!keep.has(String(doc.data().id))) batch.delete(doc.ref);}
  for(const a of incoming){
   if(!a||!a.id||!/^\d{4}-\d{2}-\d{2}$/.test(a.date||'')||!/^\d{2}:\d{2}$/.test(a.time||'')) continue;
   const ref=collection.doc(user.uid+'_'+String(a.id));
   const old=await ref.get();
   const prev=old.exists?old.data():{};
   const changed=prev.date!==a.date||prev.time!==a.time;
   batch.set(ref,{ownerUid:user.uid,id:String(a.id),client:String(a.client||'Cliente'),service:String(a.service||'Servicio'),date:a.date,time:a.time,phone:String(a.phone||''),status:String(a.status||''),updatedAt:admin.firestore.FieldValue.serverTimestamp(),sent30m:changed?false:!!prev.sent30m,sentAtTime:changed?false:!!prev.sentAtTime},{merge:true});
  }
  await batch.commit();
  return json(200,{ok:true,count:incoming.length});
 }catch(error){console.error(error);return json(400,{error:'No se pudieron sincronizar las citas.'});}
};
