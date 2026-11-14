import {getAdmin,verifyUser,json} from './_firebase.mjs';
import {createHash} from 'node:crypto';
export default async (event)=>{
 if(event.httpMethod!=='POST') return json(405,{error:'Method not allowed'});
 try{
  const admin=getAdmin(), user=await verifyUser(event,admin);
  const {token}=JSON.parse(event.body||'{}');
  if(typeof token!=='string'||token.length<20) return json(400,{error:'Token inválido'});
  const id=createHash('sha256').update(token).digest('hex');
  await admin.firestore().collection('devices').doc(id).set({ownerUid:user.uid,token,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
  return json(200,{ok:true});
 }catch(error){console.error(error);return json(401,{error:'No se pudo registrar este dispositivo.'});}
};
