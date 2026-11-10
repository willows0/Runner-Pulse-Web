/* Runner Pulse - background Firebase messages (data-only, avoid duplicate alerts). */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
firebase.initializeApp({apiKey:'AIzaSyBVTj9i4545kOmvx3H78_YliE54nPSFyLg',authDomain:'runnerpulse.firebaseapp.com',projectId:'runnerpulse',messagingSenderId:'602428716854',appId:'1:602428716854:web:1bd814e1ce8534fce6e597'});
const messaging=firebase.messaging();
messaging.onBackgroundMessage(payload=>{
 const data=payload.data||{};
 const title=data.title||'Runner Pulse · Coach AI';
 const options={body:data.body||'Il tuo allenatore ti aspetta.',icon:'/runner-pulse-icon-192.png',image:'/runner-pulse-icon-512.png',badge:'/runner-pulse-notification-badge.png',tag:data.tag||'runnerpulse-coach',data:{url:data.url||'/index.html?weeklyCoach=1'}};
 return self.registration.showNotification(title,options);
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const url=new URL(event.notification.data?.url||'/index.html?weeklyCoach=1',self.location.origin).href;
 event.waitUntil((async()=>{
  const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows){if(new URL(client.url).origin===self.location.origin){await client.navigate(url);await client.focus();const activityId=new URL(url).searchParams.get('coachActivity');if(activityId)client.postMessage({type:'runnerpulse:open-coach',activityId});return;}}
  return clients.openWindow(url);
 })());
});
