import {useEffect,useRef} from 'react';
import {createChart,type UTCTimestamp} from 'lightweight-charts';
import {type Candle,aggregate,ema} from './lib/indicators.ts';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function Chart({candles,tf}:{candles:Candle[];tf:number}){
 const box=useRef<HTMLDivElement>(null),s=useRef<any>(null),fit=useRef(true);
 useEffect(()=>{
  const ch=createChart(box.current!,{autoSize:true,layout:{background:{color:'#000'},textColor:'#8a8f98'},
   grid:{vertLines:{color:'#0d0d0d'},horzLines:{color:'#0d0d0d'}},timeScale:{timeVisible:true,secondsVisible:false,borderColor:'#222'},rightPriceScale:{borderColor:'#222'}});
  const c=ch.addCandlestickSeries({upColor:'#00ff88',downColor:'#ff3b5c',borderVisible:false,wickUpColor:'#00ff88',wickDownColor:'#ff3b5c'});
  c.priceScale().applyOptions({scaleMargins:{top:.05,bottom:.25}});
  const v=ch.addHistogramSeries({priceScaleId:'vol',priceFormat:{type:'volume'}});
  ch.priceScale('vol').applyOptions({scaleMargins:{top:.8,bottom:0}});
  const l=['#ffd400','#00bfff','#ff66ff'].map(color=>ch.addLineSeries({color,lineWidth:1,priceLineVisible:false,lastValueVisible:false}));
  s.current={ch,c,v,l};return()=>ch.remove()},[]);
 useEffect(()=>{fit.current=true},[tf]);
 useEffect(()=>{
  const x=s.current;if(!x)return;const b=aggregate(candles,tf*60);if(!b.length)return;
  const T=(k:Candle)=>k.t as UTCTimestamp;
  x.c.setData(b.map(k=>({time:T(k),open:k.o,high:k.h,low:k.l,close:k.c})));
  x.v.setData(b.map(k=>({time:T(k),value:k.v,color:k.c>=k.o?'#00ff8844':'#ff3b5c44'})));
  const cl=b.map(k=>k.c);[9,21,50].forEach((n,i)=>{const e=ema(cl,n);x.l[i].setData(b.map((k,j)=>({time:T(k),value:e[j]})))});
  if(fit.current&&b.length>5){fit.current=false;x.ch.timeScale().setVisibleLogicalRange({from:Math.max(0,b.length-80),to:b.length+3})}
 });
 return <div ref={box} className="chart"/>;
}
