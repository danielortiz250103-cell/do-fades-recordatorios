import admin from 'firebase-admin';
let app;
export function getAdmin(){
  if(!app){
    const raw=process.env.FIREBASE_SERVICE_ACCOUNT;
    if(!raw) throw new Error('Falta la variable FIREBASE_SERVICE_ACCOUNT en Netlify.');
    const serviceAccount=JSON.parse(raw);
    app=admin.initializeApp({credential:admin.credential.cert(serviceAccount)});
  }
  return admin;
}
export async function verifyUser(event,adminSdk){
  const header=event.headers.authorization||event.headers.Authorization||'';
  const match=header.match(/^Bearer (.+)$/);
  if(!match) throw new Error('No autorizado');
  return adminSdk.auth().verifyIdToken(match[1]);
}
export function json(statusCode,body){return {statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(body)};}
