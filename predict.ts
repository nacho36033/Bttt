import {type Candle,type Trade,ema,rsi,atr,macd,vwap,bollinger,aggregate,mean,sd} from './indicators.ts';
export type Dir='UP'|'DOWN'|'NEUTRAL';
export const HS=[5,10,15];
export type Flow={buy:Record<number,number|null>;book:number|null}; // buy = taker-buy share of volume; book = bid/ask imbalance (-1..1)
export const NOFLOW:Flow={buy:{5:null,10:null,15:null},book:null};
export type Cal={n:number[];up:number[]};
export const newCal=():Cal=>({n:Array(10).fill(0),up:Array(10).fill(0)});
const bin=(p:number)=>Math.min(9,Math.floor(p*10));
const calibrate=(p:number,c:Cal)=>{const i=bin(p),n=c.n[i];if(!n)return p;const w=n/(n+40);return w*(c.up[i]/n)+(1-w)*p};
export type Pred={h:number;t:number;price:number;dir:Dir;pUp:number;pDown:number;conf:number;lo:number;hi:number;agree:number;why:string[]};
export type Intel={bias:string;momentum:number;buy:number|null;sell:number|null;vol:string;condition:string;flags:string[];chaos:boolean};
const NAMES=['EMA 9/21 trend','EMA 21/50 trend','Momentum','MACD','RSI','VWAP position','Bollinger bands','Volume thrust','Breakout/structure','Candle pattern','Order flow','Order book'];
// Each horizon weights the same signals differently AND runs on its own bar size (5m=1m bars, 10m=2m bars, 15m=3m bars).
const W:Record<number,number[]>={
 5:[1.2,.4,1,1,.8,.5,.7,.8,.6,.7,1.2,1],
 10:[1,.8,1,.9,.7,.7,.5,.6,.8,.4,.9,.7],
 15:[.7,1.3,1.1,.8,.5,1,.3,.4,1,.2,.6,.5]};
const G:Record<number,number>={5:1.6,10:1.4,15:1.2};
const th=Math.tanh,clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const hs=(a:Candle[])=>Math.max(...a.map(k=>k.h)),ls=(a:Candle[])=>Math.min(...a.map(k=>k.l));
const retsOf=(cs:Candle[])=>cs.slice(-61).map((k,i,a)=>i?Math.log(k.c/a[i-1].c):0).slice(1);
export type Core={pRaw:number;agree:number;price:number;sigma:number;volRatio:number;sig:(number|null)[]};

export function core(cs:Candle[],h:number,f:Flow):Core|null{
 const b=aggregate(cs,12*h);if(b.length<60)return null;
 const L=b.length-1,c=b.map(k=>k.c),px=c[L],k0=b[L],p=b[L-1],A=atr(b)||px*5e-4;
 const e9=ema(c,9),e21=ema(c,21),e50=ema(c,50),m=macd(c),r=rsi(c),bb=bollinger(c),vw=vwap(b.slice(-60));
 const vAvg=mean(b.slice(-30,-3).map(k=>k.v)),vNow=mean(b.slice(-3).map(k=>k.v));
 const thrust=Math.max(0,th(Math.log(Math.max(vNow/(vAvg||1),.01))))*Math.sign(px-c[L-3]);
 const pr=b.slice(-21,-1),hh=hs(pr),ll=ls(pr);
 const brk=px>hh?1:px<ll?-1:k0.h>hh?-.6:k0.l<ll?.6:0; // last two = failed breakout / liquidity sweep
 const r1=b.slice(-10),r0=b.slice(-20,-10);
 const st=hs(r1)>hs(r0)&&ls(r1)>ls(r0)?1:hs(r1)<hs(r0)&&ls(r1)<ls(r0)?-1:0; // higher-high/low vs lower-high/low
 const body=Math.abs(k0.c-k0.o),rg=k0.h-k0.l||1e-9,lw=Math.min(k0.o,k0.c)-k0.l,uw=k0.h-Math.max(k0.o,k0.c);
 const pat=p.c<p.o&&k0.c>k0.o&&k0.c>=p.o&&k0.o<=p.c?1:p.c>p.o&&k0.c<k0.o&&k0.c<=p.o&&k0.o>=p.c?-1:
  lw>2*body&&uw<body+rg*.1?.6:uw>2*body&&lw<body+rg*.1?-.6:0;
 const fb=f.buy[h];
 const sig:(number|null)[]=[
  th(2*(e9[L]-e21[L])/A),th(2*(e21[L]-e50[L])/A),th((px-c[L-5])/(A*Math.sqrt(5))),
  .7*th(4*m.hist/A)+.3*Math.sign(m.hist-m.prevHist),
  r>70?-clamp((r-70)/20,0,1):r<30?clamp((30-r)/20,0,1):(r-50)/100,
  th((px-vw)/A),
  bb.pb>1?-th(3*(bb.pb-1)):bb.pb<0?th(-3*bb.pb):(bb.pb-.5)*.6,
  thrust,.7*brk+.3*st,pat,
  fb==null?null:th(3*(fb-.5)),f.book==null?null:th(2*f.book)];
 const w=W[h];let sw=0,ss=0,dec=0,ag=0;
 sig.forEach((s,i)=>{if(s!=null){sw+=w[i];ss+=w[i]*s}});const score=ss/sw;
 sig.forEach((s,i)=>{if(s==null||Math.abs(s)<.1)return;dec+=w[i];if(Math.sign(s)===Math.sign(score))ag+=w[i]});
 const rets=retsOf(cs),sL=sd(rets);
 return{pRaw:.5+.25*th(G[h]*score),agree:dec?ag/dec:0,price:cs[cs.length-1].c,sigma:sL*cs[cs.length-1].c*Math.sqrt(h),volRatio:sd(rets.slice(-5))/(sL||1e-9),sig};
}

export function decide(k:Core,h:number,cal:Cal):Pred{
 const pUp=calibrate(k.pRaw,cal),edge=Math.abs(pUp-.5),chaos=k.volRatio>2.5,pct=Math.round(k.agree*100);
 const dir:Dir=chaos||k.agree<.6||edge<.03?'NEUTRAL':pUp>.5?'UP':'DOWN';
 const top=k.sig.map((s,i)=>({s,i,v:s==null?0:Math.abs(s*W[h][i])})).sort((a,b)=>b.v-a.v).slice(0,3)
  .filter(x=>x.s!=null&&x.v>.05).map(x=>`${NAMES[x.i]} ${(x.s as number)>0?'bullish':'bearish'}`);
 const why=[...(chaos?['Volatility spike: too unpredictable']:[]),k.agree<.6?`Signals conflict (${pct}% agree)`:`${pct}% of weighted signals agree`,...top];
 return{h,t:Date.now(),price:k.price,dir,pUp,pDown:1-pUp,conf:clamp(edge/.25,0,1)*k.agree,lo:k.price-k.sigma,hi:k.price+k.sigma,agree:k.agree,why};
}

export function intel(cs:Candle[],f:Flow,tape:Trade[]):Intel|null{
 if(cs.length<60)return null;
 const c=cs.map(k=>k.c),L=c.length-1,px=c[L],A=atr(cs)||px*5e-4,flags:string[]=[],now=Date.now();
 const rets=retsOf(cs),sL=sd(rets)||1e-9,vr=sd(rets.slice(-5))/sL;
 const vol=vr>2.5?'EXTREME':vr>1.5?'EXPANDING':vr<.6?'COMPRESSED':'NORMAL';
 if(vr>1.5)flags.push('Volatility expansion');
 if(mean(cs.slice(-3).map(k=>k.v))>2.5*mean(cs.slice(-33,-3).map(k=>k.v)))flags.push('Unusual volume');
 if(Math.abs(Math.log(px/c[L-3]))>2.5*sL*Math.sqrt(3))flags.push('Rapid price move');
 const t2=tape.filter(x=>x.t>now-12e4),bv=t2.filter(x=>x.side==='BUY').reduce((a,x)=>a+x.s,0),tv=t2.reduce((a,x)=>a+x.s,0);
 const buy=t2.length>=5&&tv>0?bv/tv:null;
 if(buy!=null&&buy>.7)flags.push('Sudden buying pressure');
 if(buy!=null&&buy<.3)flags.push('Sudden selling pressure');
 const avg=mean(tape.map(x=>x.s)),big=avg>0?tape.filter(x=>x.t>now-3e5&&x.s>8*avg):[],nb=big.filter(x=>x.side==='BUY').length;
 if(nb)flags.push(`Large market buys x${nb}`);if(big.length-nb)flags.push(`Large market sells x${big.length-nb}`);
 if(f.book!=null&&Math.abs(f.book)>.35)flags.push(f.book>0?'Bid-heavy order book':'Ask-heavy order book');
 const m=macd(c),r=rsi(c);
 if(r>75&&m.hist<m.prevHist)flags.push('Bullish momentum exhaustion');
 if(r<25&&m.hist>m.prevHist)flags.push('Bearish momentum exhaustion');
 const pr=cs.slice(-21,-1),k0=cs[L];
 if(k0.h>hs(pr)&&px<hs(pr))flags.push('Possible fake breakout / liquidity sweep above highs');
 if(k0.l<ls(pr)&&px>ls(pr))flags.push('Possible liquidity sweep below lows');
 const e9=ema(c,9)[L],e21=ema(c,21)[L],e50=ema(c,50)[L],u=(e21>e50?1:-1)+(px>vwap(cs.slice(-60))?1:-1)+(e9>e21?1:-1);
 const chaos=vr>2.5;
 return{bias:u>=2?'BULLISH':u<=-2?'BEARISH':'MIXED',momentum:Math.round(Math.abs(th((px-c[L-15])/(A*Math.sqrt(15))))*100),buy,sell:buy==null?null:1-buy,vol,flags,chaos,
  condition:chaos?'TOO UNPREDICTABLE':vol==='COMPRESSED'?'QUIET / COILING':Math.abs(e9-e50)/A>1.5?'TRENDING':'RANGING'};
}

export function predictAll(cs:Candle[],f:Flow,tape:Trade[],cals:Record<number,Cal>){
 const w=cs.slice(-300);
 return{preds:HS.map(h=>{const k=core(w,h,f);return k?decide(k,h,cals[h]??newCal()):null}),intel:intel(w,f,tape)};
}

export type BT={n:number;trades:number;hits:number;baseUp:number};
// Chronological walk-forward: at minute i only data up to i is used; calibration learns only from outcomes already resolved by i.
// Candle-only features (order flow / book are not available historically).
export function backtest(cs:Candle[]){
 const res:Record<number,BT>={},cals:Record<number,Cal>={};
 for(const h of HS){
  const cal=newCal(),raw:(number|null)[]=[];let n=0,trades=0,hits=0,ups=0;
  for(let i=200;i<cs.length-h;i++){
   const j=i-h;
   if(j>=200&&raw[j]!=null&&cs[i].c!==cs[j].c){const b=bin(raw[j] as number);cal.n[b]++;cal.up[b]+=cs[i].c>cs[j].c?1:0}
   const k=core(cs.slice(Math.max(0,i-299),i+1),h,NOFLOW);raw[i]=k?k.pRaw:null;if(!k)continue;
   const d=decide(k,h,cal),a=cs[i+h].c-cs[i].c;if(!a)continue;
   n++;if(a>0)ups++;if(d.dir==='NEUTRAL')continue;trades++;if((a>0)===(d.dir==='UP'))hits++;
  }
  res[h]={n,trades,hits,baseUp:n?ups/n:0};cals[h]=cal;
 }
 return{res,cals};
}
