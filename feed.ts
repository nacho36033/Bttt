import type {Candle,Trade} from './indicators.ts';
import {type Flow,HS} from './predict.ts';
const REST='https://api.exchange.coinbase.com/products/BTC-USD/candles'; // public, no key
export type Status='connecting'|'live'|'stale'|'down';
export class Feed{
 candles:Candle[]=[];tape:Trade[]=[];bids=new Map<number,number>();asks=new Map<number,number>();
 price=0;bid=0;ask=0;vol24=0;chg24=0;last=0;lastMsg=0;open=false;err='';retry=0;started=false;
 private ws?:WebSocket;
 status():Status{if(!this.open)return this.retry>0?'down':'connecting';return Date.now()-this.last>15000?'stale':'live'}
 async history(pages:number){
  const end=Math.floor(Date.now()/60000)*60+60;
  const rs=await Promise.all(Array.from({length:pages},async(_,i)=>{
   const e=end-i*299*60,s=e-299*60;
   const r=await fetch(`${REST}?granularity=60&start=${new Date(s*1000).toISOString()}&end=${new Date(e*1000).toISOString()}`);
   if(!r.ok)throw new Error('Coinbase candles HTTP '+r.status);
   return (await r.json()) as number[][]}));
  const m=new Map<number,Candle>(this.candles.map(k=>[k.t,k]));
  for(const a of rs.flat())m.set(a[0],{t:a[0],l:a[1],h:a[2],o:a[3],c:a[4],v:a[5]});
  this.candles=[...m.values()].sort((a,b)=>a.t-b.t);
 }
 start(){if(this.started)return;this.started=true;this.connect();
  setInterval(()=>{if(this.open&&Date.now()-this.lastMsg>20000)this.ws?.close()},5000)}
 private connect(){
  const ws=new WebSocket('wss://advanced-trade-ws.coinbase.com');this.ws=ws;
  ws.onopen=()=>{this.open=true;this.err='';this.retry=0;this.lastMsg=Date.now();this.bids.clear();this.asks.clear();
   for(const channel of ['ticker','market_trades','level2'])ws.send(JSON.stringify({type:'subscribe',product_ids:['BTC-USD'],channel}));
   this.history(1).catch(()=>{})};
  ws.onmessage=e=>{this.lastMsg=Date.now();try{this.handle(JSON.parse(e.data))}catch{}};
  ws.onclose=()=>{if(this.ws!==ws)return;this.ws=undefined;this.open=false;this.retry++;setTimeout(()=>this.connect(),Math.min(30000,1000*2**this.retry))};
  ws.onerror=()=>ws.close();
 }
 private tick(p:number,s:number,ms:number){
  const t=Math.floor(ms/60000)*60,k=this.candles[this.candles.length-1];
  if(!k||t>k.t)this.candles.push({t,o:p,h:p,l:p,c:p,v:s});
  else if(t===k.t){k.h=Math.max(k.h,p);k.l=Math.min(k.l,p);k.c=p;k.v+=s}
 }
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 private handle(m:any){
  if(m.type==='error'){this.err=m.message||'Feed error';return}
  for(const ev of m.events||[]){
   if(m.channel==='ticker')for(const t of ev.tickers||[]){
    this.price=+t.price;this.bid=+t.best_bid;this.ask=+t.best_ask;this.vol24=+t.volume_24_h;this.chg24=+t.price_percent_chg_24_h;
    this.last=Date.now();this.tick(this.price,0,this.last)}
   else if(m.channel==='market_trades')for(const x of ev.trades||[]){
    const t=Date.parse(x.time),p=+x.price,s=+x.size;this.tape.push({t,p,s,side:x.side==='BUY'?'BUY':'SELL'});
    if(ev.type==='update'){this.price=p;this.last=Date.now();this.tick(p,s,t)}}
   else if(m.channel==='l2_data'){
    if(ev.type==='snapshot'){this.bids.clear();this.asks.clear()}
    for(const u of ev.updates||[]){const q=+u.new_quantity,p=+u.price_level,mp=u.side==='bid'?this.bids:this.asks;if(q===0)mp.delete(p);else mp.set(p,q)}}
  }
  const cut=Date.now()-18e5;if(this.tape.length>5000||(this.tape[0]?.t??Infinity)<cut)this.tape=this.tape.filter(x=>x.t>=cut);
 }
 book():number|null{
  if(!this.price||this.bids.size<5||this.asks.size<5)return null;
  const lo=this.price*.9975,hi=this.price*1.0025;let b=0,a=0;
  this.bids.forEach((q,p)=>{if(p>=lo)b+=q});this.asks.forEach((q,p)=>{if(p<=hi)a+=q});
  return b+a?(b-a)/(b+a):null}
 flow():Flow{const now=Date.now(),buy:Record<number,number|null>={};
  for(const h of HS){let b=0,t=0,n=0;for(const x of this.tape)if(x.t>=now-h*6e4){n++;t+=x.s;if(x.side==='BUY')b+=x.s}buy[h]=n>=5&&t>0?b/t:null}
  return{buy,book:this.book()}}
}
