import type {Candle} from './indicators.ts';
import type {Dir,Pred} from './predict.ts';
export type Rec={id:string;h:number;t:number;exp:number;entry:number;dir:Dir;pUp:number;conf:number;actual?:number;ok?:boolean|null}; // ok undefined=pending, null=not scored
const K='btcpulse.history.v1';
export const load=():Rec[]=>{try{return JSON.parse(localStorage.getItem(K)||'[]')}catch{return[]}};
export const save=(r:Rec[])=>{try{localStorage.setItem(K,JSON.stringify(r.slice(-1000)))}catch{}};
export const mk=(p:Pred):Rec=>({id:`${p.h}-${p.t}`,h:p.h,t:p.t,exp:p.t+p.h*6e4,entry:p.price,dir:p.dir,pUp:p.pUp,conf:p.conf});
// Actual price = close of the last full 1-minute candle ending at/before expiry (error < 1 min).
export function resolve(rs:Rec[],cs:Candle[],now:number){const done:Rec[]=[];
 for(const r of rs){if(r.ok!==undefined||now<r.exp+6e4)continue;
  let c:Candle|undefined;for(const k of cs)if(k.t+60<=r.exp/1000)c=k;
  if(c&&c.t+120>=r.exp/1000){r.actual=c.c;r.ok=r.dir==='NEUTRAL'||c.c===r.entry?null:(c.c>r.entry)===(r.dir==='UP');done.push(r)}
  else if(now-r.exp>864e5){r.ok=null;done.push(r)}}
 return done}
export const scored=(rs:Rec[])=>rs.filter(r=>typeof r.ok==='boolean');
export const acc=(rs:Rec[])=>{const s=scored(rs),w=s.filter(r=>r.ok).length;return{n:s.length,w,pct:s.length?100*w/s.length:null}};
export const streaks=(rs:Rec[])=>{let run=0,bw=0,bl=0;for(const r of scored(rs)){run=r.ok?(run>0?run+1:1):(run<0?run-1:-1);bw=Math.max(bw,run);bl=Math.max(bl,-run)}return{cur:run,bw,bl}};
