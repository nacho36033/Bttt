import {useEffect,useRef,useState} from 'react';
import {Feed} from './lib/feed.ts';
import {HS,predictAll,backtest,type Pred,type Intel,type Cal,type BT} from './lib/predict.ts';
import {type Rec,load,save,mk,resolve,acc,scored,streaks} from './lib/store.ts';
import Chart from './Chart.tsx';

const f$=(n:number,d=2)=>n.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const hms=(t:number)=>new Date(t).toLocaleTimeString();
const mmss=(ms:number)=>{const s=Math.max(0,Math.round(ms/1000));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`};
const cls=(d:string)=>d==='UP'?'up':d==='DOWN'?'down':'flat';
const fp=(a:{pct:number|null;w:number;n:number})=>a.pct==null?'no scored predictions yet':`${f$(a.pct,1)}% (${a.w}/${a.n})`;
type Res={preds:(Pred|null)[];intel:Intel|null};

export default function App(){
 const [F]=useState(()=>new Feed());
 const [,force]=useState(0);
 const [res,setRes]=useState<Res>({preds:[null,null,null],intel:null});
 const [bt,setBt]=useState<Record<number,BT>|null>(null);
 const [tf,setTf]=useState(1),[busy,setBusy]=useState(false),[msg,setMsg]=useState('');
 const [notif,setNotif]=useState(localStorage.getItem('btcpulse.notif')==='1');
 const notifRef=useRef(notif),recs=useRef<Rec[]>(load()),cals=useRef<Record<number,Cal>>({});
 const cool=useRef<Record<string,number>>({}),prevDir=useRef<Record<number,string>>({}),prevBias=useRef('');

 const note=(key:string,title:string,body:string)=>{
  if(!notifRef.current||typeof Notification==='undefined'||Notification.permission!=='granted')return;
  const n=Date.now();if(n-(cool.current[key]||0)<3e5)return;cool.current[key]=n;
  navigator.serviceWorker?.ready.then(r=>r.showNotification(title,{body,icon:'icon-192.png'})).catch(()=>{try{new Notification(title,{body})}catch{/* ignore */}});
 };
 const compute=()=>{const r=predictAll(F.candles,F.flow(),F.tape,cals.current);setRes(r);return r};
 const track=(r:Res,forceNew:boolean)=>{
  if(F.status()!=='live')return;const now=Date.now();let ch=false;
  r.preds.forEach(p=>{if(!p)return;
   const has=recs.current.some(x=>x.h===p.h&&(forceNew?now-x.t<2e4:x.exp>now));
   if(!has){recs.current.push(mk(p));ch=true}
   if(p.dir!=='NEUTRAL'&&p.conf>=.5&&prevDir.current[p.h]!==p.dir)note('s'+p.h,`${p.dir==='UP'?'Bullish':'Bearish'} signal (${p.h} min)`,`${f$(p.pUp*100,0)}% up, confidence ${f$(p.conf*100,0)}%`);
   prevDir.current[p.h]=p.dir});
  const i=r.intel;
  if(i){if(i.vol==='EXPANDING'||i.vol==='EXTREME')note('vol','Volatility alert',i.condition);
   if(prevBias.current&&prevBias.current!==i.bias)note('bias','Momentum shift',`Market bias is now ${i.bias}`);prevBias.current=i.bias}
  if(ch)save(recs.current);
 };
 useEffect(()=>{
  F.start();
  F.history(4).then(()=>setTimeout(()=>{const b=backtest(F.candles);cals.current=b.cals;setBt(b.res);track(compute(),false)},50))
   .catch(e=>setMsg('History unavailable: '+e.message));
  const a=setInterval(()=>force(n=>n+1),500);
  const b=setInterval(()=>{
   const done=resolve(recs.current,F.candles,Date.now());
   if(done.length){save(recs.current);done.forEach(r=>note('x'+r.id,`${r.h} min prediction expired`,`${r.dir}: ${r.ok===true?'correct':r.ok===false?'wrong':'not scored'}`))}
   if(F.candles.length)track(compute(),false)},5000);
  const v=()=>{if(!document.hidden)F.history(1).catch(()=>{})};document.addEventListener('visibilitychange',v);
  return()=>{clearInterval(a);clearInterval(b);document.removeEventListener('visibilitychange',v)};
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);

 const analyze=async()=>{
  setBusy(true);setMsg('');
  try{
   if(F.status()!=='live'){setMsg(`Feed is ${F.status().toUpperCase()}. No analysis without live data.`);return}
   await F.history(1);
   const r=compute();track(r,true);
   setMsg(r.preds.some(p=>!p)?'Not enough candle data yet.':'Analysis complete '+hms(Date.now()));
  }catch(e){setMsg('Analysis failed: '+(e as Error).message)}finally{setBusy(false)}
 };
 const toggleNotif=async()=>{
  if(!notif){
   if(typeof Notification==='undefined'){setMsg('Notifications are not available here. On iPhone, add the app to your Home Screen first (iOS 16.4+).');return}
   if(await Notification.requestPermission()!=='granted'){setMsg('Notification permission was denied.');return}}
  const v=!notif;setNotif(v);notifRef.current=v;localStorage.setItem('btcpulse.notif',v?'1':'0');
 };

 const st=F.status(),now=Date.now(),I=res.intel,R=recs.current,S=scored(R),sk=streaks(R);
 const pend=(h:number)=>R.filter(r=>r.h===h&&r.ok===undefined&&r.exp>now).pop();
 return <main>
  <header className="hd"><div><h1>BTC <b>PULSE</b></h1><div className={'st '+st}>{st==='live'?'LIVE':st.toUpperCase()} · price from Coinbase</div></div>
   <div><div className="big">{F.price?'$'+f$(F.price):'—'}</div><div className={'ch '+(F.chg24>=0?'up':'down')}>{F.price?`${F.chg24>=0?'+':''}${f$(F.chg24)}% 24h`:''}</div></div></header>
  {st!=='live'&&<div className="warn">Feed is {st}. {F.err||'Predictions pause until live data returns.'}</div>}
  <div className="mut">Last update {F.last?hms(F.last):'never'} · bid {F.bid?f$(F.bid):'—'} / ask {F.ask?f$(F.ask):'—'} · 24h vol {f$(F.vol24,0)} BTC</div>
  <button className="go" onClick={analyze} disabled={busy}>{busy?'ANALYZING…':'ANALYZE BITCOIN NOW'}</button>
  {msg&&<div className="mut">{msg}</div>}
  {HS.map((h,i)=>{const p=res.preds[i],pe=pend(h);return <section key={h} className={'card '+(p?cls(p.dir):'flat')}>
   <div className="row"><b>{h} MIN</b><span className={'dir '+(p?cls(p.dir):'flat')}>{p?(p.dir==='NEUTRAL'?'NO TRADE':p.dir):'…'}</span></div>
   {p?<><div className="bar"><i style={{width:p.pUp*100+'%'}}/></div>
    <div className="row"><span className="up">UP {f$(p.pUp*100,1)}%</span><span className="down">DOWN {f$(p.pDown*100,1)}%</span></div>
    <div className="row mut"><span>BTC ${f$(p.price)}</span><span>Confidence {f$(p.conf*100,0)}%</span></div>
    <div className="row mut"><span>Range ${f$(p.lo,0)} – ${f$(p.hi,0)}</span><span>{pe?'Expires in '+mmss(pe.exp-now):'Not tracked yet'}</span></div>
    <div className="mut">Predicted {hms(p.t)} · range is ±1σ (about 68%)</div>
    <ul>{p.why.map(w=><li key={w}>{w}</li>)}</ul></>:<div className="mut">Collecting candle data…</div>}</section>})}
  <section className="box"><div className="tf">{[1,5,15,60].map(t=><button key={t} className={tf===t?'on':''} onClick={()=>setTf(t)}>{t===60?'1h':t+'m'}</button>)}</div>
   <Chart candles={F.candles} tf={tf}/><div className="mut">Candles + volume · EMA <span style={{color:'#ffd400'}}>9</span> <span style={{color:'#00bfff'}}>21</span> <span style={{color:'#ff66ff'}}>50</span></div></section>
  <section className="box"><h2>Market intelligence</h2>
   {I?<><div className="row"><span>Bias <b className={I.bias==='BULLISH'?'up':I.bias==='BEARISH'?'down':'flat'}>{I.bias}</b></span><span>Momentum {I.momentum}/100</span></div>
    <div className="row"><span>Buying <b className="up">{I.buy==null?'—':f$(I.buy*100,0)+'%'}</b></span><span>Selling <b className="down">{I.sell==null?'—':f$(I.sell*100,0)+'%'}</b></span></div>
    <div className="row"><span>Volatility {I.vol}</span><span className={I.chaos?'down':''}>{I.condition}</span></div>
    <ul>{I.flags.length?I.flags.map(x=><li key={x}>{x}</li>):<li>No unusual activity</li>}</ul></>:<div className="mut">Collecting data…</div>}</section>
  <section className="box"><h2>Live performance (this device)</h2>
   <div>Overall {fp(acc(R))}</div>
   {HS.map(h=><div key={h} className="mut">{h} min: {fp(acc(R.filter(r=>r.h===h)))}</div>)}
   <div className="mut">Last 20: {fp(acc(S.slice(-20)))} · 50: {fp(acc(S.slice(-50)))} · 100: {fp(acc(S.slice(-100)))}</div>
   <div className="mut">Correct {S.filter(r=>r.ok).length} · Wrong {S.filter(r=>!r.ok).length} · Streak {sk.cur>0?sk.cur+' wins':sk.cur<0?-sk.cur+' losses':'—'} · Best {sk.bw} wins / worst {sk.bl} losses</div>
   <ul>{R.slice(-10).reverse().map(r=><li key={r.id}>{hms(r.t)} {r.h}m {r.dir} @ ${f$(r.entry,0)} → {r.ok===undefined?'pending':r.actual?'$'+f$(r.actual,0)+(r.ok===true?' ✓':r.ok===false?' ✗':' (unscored)'):'expired'}</li>)}</ul></section>
  <section className="box"><h2>Historical backtest (separate from live)</h2>
   {bt?<><table><tbody><tr><th>Horizon</th><th>Accuracy</th><th>Signals</th><th>Up-move base rate</th></tr>
    {HS.map(h=><tr key={h}><td>{h} min</td><td>{bt[h].trades?f$(100*bt[h].hits/bt[h].trades,1)+'%':'—'}</td><td>{bt[h].trades}/{bt[h].n}</td><td>{f$(bt[h].baseUp*100,1)}%</td></tr>)}</tbody></table>
    <div className="mut">Walk-forward over the last ~{Math.round(F.candles.length/60)}h of 1-minute candles. Uses candle features only (no historical order flow or book). Past results do not guarantee future results.</div></>:<div className="mut">Running backtest…</div>}</section>
  <button className="btn" onClick={toggleNotif}>Notifications: {notif?'ON':'OFF'}</button>
  <p className="mut foot">Analysis only. Not financial advice. No trading, no wallet connection.</p>
 </main>;
}
