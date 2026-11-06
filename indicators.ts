export type Candle={t:number;o:number;h:number;l:number;c:number;v:number}; // t = unix seconds
export type Trade={t:number;p:number;s:number;side:'BUY'|'SELL'};
export const mean=(x:number[])=>x.length?x.reduce((a,b)=>a+b,0)/x.length:0;
export const sd=(x:number[])=>{const m=mean(x);return Math.sqrt(mean(x.map(v=>(v-m)**2)))};
export const ema=(x:number[],n:number)=>{const k=2/(n+1),o:number[]=[];x.forEach((v,i)=>o.push(i?v*k+o[i-1]*(1-k):v));return o};
export const rsi=(c:number[],n=14)=>{if(c.length<=n)return 50;let g=0,l=0;
 for(let i=1;i<=n;i++){const d=c[i]-c[i-1];if(d>=0)g+=d;else l-=d}g/=n;l/=n;
 for(let i=n+1;i<c.length;i++){const d=c[i]-c[i-1];g=(g*(n-1)+Math.max(d,0))/n;l=(l*(n-1)+Math.max(-d,0))/n}
 return l===0?100:100-100/(1+g/l)};
export const atr=(cs:Candle[],n=14)=>mean(cs.map((k,i)=>i?Math.max(k.h-k.l,Math.abs(k.h-cs[i-1].c),Math.abs(k.l-cs[i-1].c)):k.h-k.l).slice(-n));
export const macd=(c:number[])=>{const a=ema(c,12),b=ema(c,26),m=a.map((v,i)=>v-b[i]),s=ema(m,9),i=m.length-1;
 return{hist:m[i]-s[i],prevHist:m[i-1]-s[i-1]}};
export const vwap=(cs:Candle[])=>{let pv=0,v=0;for(const k of cs){pv+=(k.h+k.l+k.c)/3*k.v;v+=k.v}return v?pv/v:cs[cs.length-1].c};
export const bollinger=(c:number[],n=20)=>{const w=c.slice(-n),m=mean(w),s=sd(w),u=m+2*s,l=m-2*s;return{pb:u===l?0.5:(c[c.length-1]-l)/(u-l)}};
export const aggregate=(cs:Candle[],sec:number)=>{const o:Candle[]=[];
 for(const k of cs){const t=Math.floor(k.t/sec)*sec,x=o[o.length-1];
  if(x&&x.t===t){x.h=Math.max(x.h,k.h);x.l=Math.min(x.l,k.l);x.c=k.c;x.v+=k.v}else o.push({...k,t})}return o};
