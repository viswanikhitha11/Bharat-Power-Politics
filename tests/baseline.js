'use strict';
const G=require('../server/engine/game'),M=require('../server/engine/model'),P=require('../server/data/parties');
for(const n of [7,5,3,2]){
const tot={};const T=10;
for(let g=0;g<T;g++){
const st=G.create({code:'B'+g,hostId:1,hostName:'x',settings:{rounds:4,timer:0}});
st.seats=[];for(let i=0;i<n;i++)st.seats.push({pid:P[i].id,userId:i+10,name:'h',bot:null,ready:true,connected:true});
G.start(st,1); st.incumbent=null;
const pr=M.projection(st);
st.seats.forEach((s,i)=>{tot[s.pid]=tot[s.pid]||[0,0];tot[s.pid][0]+=pr.seats[i]/T;tot[s.pid][1]+=pr.votes[i]/T*100;});
}
console.log(n+' parties (seats, vote%):',JSON.stringify(Object.fromEntries(Object.entries(tot).map(([k,v])=>[k,v.map(x=>Math.round(x))]))));
}
