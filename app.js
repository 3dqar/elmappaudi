'use strict';
const $=id=>document.getElementById(id);
const UUIDS=['0000fff0-0000-1000-8000-00805f9b34fb','0000ffe0-0000-1000-8000-00805f9b34fb','0000ffe5-0000-1000-8000-00805f9b34fb','0000ffb0-0000-1000-8000-00805f9b34fb','000018f0-0000-1000-8000-00805f9b34fb','6e400001-b5a3-f393-e0a9-e50e24dcca9e'];
const state={device:null,server:null,tx:null,rx:null,connected:false,pending:null,buffer:'',queue:Promise.resolve(),stream:false,streamToken:0,streamIndex:0,values:{},supported:new Set(),supportChecked:false,dtcs:[],protocol:'—',history:[],lastData:0,vin:null,ecuName:null,calId:null,generation:0,profile:'Audi A4 B7 · 2.0 TDI'};
const PIDS={
'04':['Нагрузка двигателя','%',a=>a[0]*100/255],
'05':['Температура ОЖ','°C',a=>a[0]-40],
'0B':['Давление во впуске (абс.)','kPa',a=>a[0]],
'0C':['Обороты','RPM',a=>(a[0]*256+a[1])/4],
'0D':['Скорость по ЭБУ','км/ч',a=>a[0]],
'0F':['Температура впуска','°C',a=>a[0]-40],
'10':['Расход воздуха (MAF)','г/с',a=>(a[0]*256+a[1])/100],
'11':['Дроссель','%',a=>a[0]*100/255],
'23':['Давление топливной рампы','bar',a=>(a[0]*256+a[1])/10],
'2F':['Уровень топлива (если поддерж.)','%',a=>a[0]*100/255],
'33':['Атмосферное давление','kPa',a=>a[0]],
'42':['Напряжение ECU','В',a=>(a[0]*256+a[1])/1000],
'5C':['Температура масла','°C',a=>a[0]-40],
'5E':['Расход топлива','л/ч',a=>(a[0]*256+a[1])/20],
'61':['Запрошенный момент','%',a=>a[0]-125],
'62':['Фактический момент','%',a=>a[0]-125],
'63':['Опорный момент','Н·м',a=>a[0]*256+a[1]]
};
const COMMANDS=['0C','0D','0B','33','05','0F','10','04','23','5E','42','2F','5C','62','63','61'];
const DB={
P0100:['Неисправность цепи MAF','Датчик массового расхода воздуха, проводка, питание, подсос воздуха.'],
P0101:['MAF: сигнал вне диапазона','Загрязнение MAF, негерметичность впуска, воздушный фильтр, EGR.'],
P0102:['MAF: низкий сигнал','MAF, разъём, проводка, питание.'],
P0113:['Температура воздуха на впуске: высокий сигнал','Датчик IAT, обрыв цепи, разъём.'],
P0234:['Передув турбокомпрессора','Геометрия турбины, вакуум, N75, актуатор, датчик давления.'],
P0299:['Недостаточный наддув турбокомпрессора','Утечка наддува, вакуум, N75, актуатор, турбина, датчик MAP.'],
P0401:['Недостаточный поток EGR','Засорение EGR/каналов, клапан, управление EGR.'],
P0402:['Избыточный поток EGR','Зависший EGR, привод, датчики.'],
P0671:['Свеча накаливания цилиндра 1: цепь','Свеча, проводка, реле/блок управления.'],
P0672:['Свеча накаливания цилиндра 2: цепь','Свеча, проводка, реле/блок управления.'],
P0673:['Свеча накаливания цилиндра 3: цепь','Свеча, проводка, реле/блок управления.'],
P0674:['Свеча накаливания цилиндра 4: цепь','Свеча, проводка, реле/блок управления.'],
P0191:['Давление топлива: датчик/диапазон','Датчик давления рампы, регулятор, подача топлива, проводка.'],
P0087:['Недостаточное давление топливной рампы','Фильтр, топливный насос, утечки, регулятор, форсунки.'],
P2002:['Низкая эффективность сажевого фильтра','DPF, утечки выхлопа, датчик перепада давления.'],
P2453:['Датчик перепада давления DPF','Трубки датчика, проводка, сам датчик.'],
P0300:['Обнаружены пропуски воспламенения','Подача топлива, компрессия, воздух, система зажигания на бензиновых двигателях.'],
P0128:['Температура охлаждения ниже нормы','Термостат, датчик температуры, система охлаждения.']
};
const log=(s)=>{const t=new Date().toLocaleTimeString('ru-RU');$('log').textContent+='['+t+'] '+s+'\n';$('log').scrollTop=$('log').scrollHeight};
const toast=(s)=>{const e=$('toast');e.textContent=s;e.style.display='block';setTimeout(()=>{if(e.textContent===s)e.style.display='none'},2700)};
const short=u=>String(u).replace('-0000-1000-8000-00805f9b34fb','').slice(0,13);
function setConnection(ok){state.connected=ok;$('connection').textContent=ok?'● Подключён':'● Не подключён';$('connection').className='status'+(ok?' connected':'');document.querySelectorAll('[data-needs-ble]').forEach(el=>el.disabled=!ok);$('connect').disabled=ok;$('disconnect').disabled=!ok}
function page(name){document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.id==='page-'+name));document.querySelectorAll('nav button').forEach(el=>el.classList.toggle('active',el.dataset.page===name));window.scrollTo({top:0,behavior:'instant'});if(name==='sport')drawChart();}
document.querySelectorAll('nav button').forEach(el=>el.addEventListener('click',()=>page(el.dataset.page)));
function onDisconnect(){state.generation++;stopStream();if(state.pending){clearTimeout(state.pending.timer);state.pending.reject(Error('BLE отключился'));state.pending=null}state.server=null;state.tx=null;state.rx=null;state.vin=null;state.ecuName=null;state.calId=null;state.values={};state.supported.clear();state.supportChecked=false;setConnection(false);$('device').textContent='—';$('bleprofile').textContent='—';$('ecustatus').textContent='ЭБУ ещё не проверен';$('pidcount').textContent='—';$('scanstatus').textContent='Ожидание подключения';updateIdentity();render();renderSensors();log('Соединение разорвано');}
async function connect(){
 if(!navigator.bluetooth){toast('Используй Bluefy: Web Bluetooth недоступен');return}
 try{
 log('Открываю поиск BLE');const dev=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:UUIDS});state.device=dev;
 dev.addEventListener('gattserverdisconnected',onDisconnect);state.server=await dev.gatt.connect();log('GATT: '+(dev.name||'без названия'));
 let services=[];
 for(const id of UUIDS){try{const s=await state.server.getPrimaryService(id);services.push({s,cs:await s.getCharacteristics()})}catch(e){}}
 const chosen=services.find(x=>short(x.s.uuid).toUpperCase()==='0000FFF0')||services[0];
 if(!chosen)throw Error('BLE сервис ELM327 не найден');
 const w=chosen.cs.find(c=>short(c.uuid).toUpperCase()==='0000FFF1'&&(c.properties.write||c.properties.writeWithoutResponse))||chosen.cs.find(c=>c.properties.write||c.properties.writeWithoutResponse);
 const r=chosen.cs.find(c=>short(c.uuid).toUpperCase()==='0000FFF1'&&(c.properties.notify||c.properties.indicate))||chosen.cs.find(c=>c.properties.notify||c.properties.indicate);
 if(!w||!r)throw Error('Не найдены характеристики записи/уведомлений');
 state.tx=w;state.rx=r;await r.startNotifications();r.addEventListener('characteristicvaluechanged',onNotify);
 $('device').textContent=dev.name||'OBDII';$('bleprofile').textContent=short(chosen.s.uuid)+' · '+short(w.uuid)+' / '+short(r.uuid);
 state.generation++;state.vin=null;state.ecuName=null;state.calId=null;state.supported.clear();state.supportChecked=false;state.values={};state.history=[];state.dtcs=[];updateIdentity();renderDTC();renderSensors();render();setConnection(true);log('Подключено. BLE '+$('bleprofile').textContent);
 await run('ATI',4000);await run('ATE0',3000);await run('ATL0',3000);await run('ATS0',3000);await run('ATH0',3000);await run('ATSP0',3000);
 toast('Адаптер подключён');void identifyVehicle();
 }catch(e){log('Ошибка подключения: '+(e.message||e));toast('Подключение не удалось');if(state.device?.gatt?.connected)state.device.gatt.disconnect();else onDisconnect()}
}
function onNotify(event){
 const d=event.target.value;const bytes=new Uint8Array(d.buffer,d.byteOffset,d.byteLength);
 const text=new TextDecoder().decode(bytes);state.buffer+=text;
 if(state.buffer.length>8192){log('Буфер превышен');state.buffer='';if(state.pending){const p=state.pending;state.pending=null;clearTimeout(p.timer);p.reject(Error('Слишком длинный ответ ELM'))}}
 if(state.pending&&state.buffer.includes('>')){
  const p=state.pending;state.pending=null;clearTimeout(p.timer);
  const text=state.buffer.slice(0,state.buffer.indexOf('>'));state.buffer=state.buffer.slice(state.buffer.indexOf('>')+1);
  p.resolve(text);
 }
}
function raw(command,timeout=5500){
 if(!state.connected)return Promise.reject(Error('Нет соединения'));
 return new Promise(async(resolve,reject)=>{
  state.buffer='';
  const timer=setTimeout(()=>{state.pending=null;reject(Error('Таймаут ответа '+command))},timeout);
  state.pending={resolve,reject,timer};
  try{
   const data=new TextEncoder().encode(command+'\r');
   if(state.tx.properties.writeWithoutResponse&&state.tx.writeValueWithoutResponse)await state.tx.writeValueWithoutResponse(data);
   else if(state.tx.writeValueWithResponse)await state.tx.writeValueWithResponse(data);
   else await state.tx.writeValue(data);
  }catch(e){clearTimeout(timer);state.pending=null;reject(e)}
 });
}
function run(command,timeout=5500){
 const generation=state.generation;
 const work=state.queue.catch(()=>{}).then(async()=>{
  if(!state.connected||generation!==state.generation)throw Error('Адаптер отключён или подключён заново');
  const out=await raw(command,timeout);log('→ '+command+'  ← '+out.replace(/[\r\n]+/g,' | ').slice(0,230));return out;
 });
 state.queue=work.catch(()=>{});return work;
}
function hexLines(raw){
 return raw.toUpperCase().split(/[\r\n]+/).map(x=>x.trim()).filter(x=>x&&!/^(SEARCHING|BUS INIT|OK|\?|NO DATA|STOPPED|UNABLE|ERROR|AT|ELM327)/.test(x)&&!/^(01[A-F0-9]{2}|03|07|0A)$/.test(x)).map(x=>x.replace(/[^0-9A-F]/g,'')).filter(x=>x.length>=4);
}
function payload(raw,mode,pid){
 const bytes=responseBytes(raw,mode);
 const svc=parseInt(mode,16),requested=parseInt(pid,16);
 const i=bytes.findIndex((b,k)=>b===svc&&bytes[k+1]===requested);
 return i<0?null:bytes.slice(i+2);
}
function get(pid){return state.values[pid]}
function setMetric(pid,value){state.values[pid]=value;state.lastData=Date.now();render();}
async function queryPID(pid){
 const out=await run('01'+pid);
 if(/NO DATA|UNABLE TO CONNECT|STOPPED|ERROR/i.test(out))return null;
 const bytes=payload(out,'41',pid);
 if(!bytes||!PIDS[pid])return null;
 if(bytes.length<(new Set(['0C','10','23','42','5E','63']).has(pid)?2:1))return null;
 const n=PIDS[pid][2](bytes);
 if(Number.isFinite(n)){setMetric(pid,n);renderSensors();return n}
 return null;
}
async function probe(){
 if(!state.connected)return;stopStream();state.supported.clear();state.supportChecked=false;$('ecustatus').textContent='Проверка…';
 try{
  const protocol=await run('ATDP',3500);state.protocol=protocol.trim()||'Не определён';$('protocol').textContent=state.protocol;
  let blocks=[];
  for(const pid of ['00','20','40','60']){
   const raw=await run('01'+pid,8500);
   const bytes=payload(raw,'41',pid);
   if(!bytes||bytes.length<4){log('Не получена карта PID '+pid);if(pid==='00')break;continue;}
   const start=parseInt(pid,16);let continuation=false;
   for(let i=0;i<32;i++){if(bytes[Math.floor(i/8)]&(1<<(7-i%8))){const x=(start+i+1).toString(16).toUpperCase().padStart(2,'0');state.supported.add(x);if(i===31)continuation=true}}
   blocks.push(pid);
   if(!continuation)break;
  }
  state.supportChecked=blocks.length>0;
  $('ecustatus').textContent=state.supportChecked?'ЭБУ отвечает · '+state.supported.size+' PID':'Нет подтверждения OBD';
  $('pidcount').textContent=state.supportChecked?String(state.supported.size):'—';
  renderSensors();toast(state.supportChecked?'Связь с ЭБУ подтверждена':'Нет ответа от ЭБУ');
 }catch(e){$('ecustatus').textContent='Ошибка соединения';log('ЭБУ: '+e.message);toast('Не удалось связаться с ЭБУ')}
}
function format(v,dec=1){return Number.isFinite(v)?Number(v).toFixed(dec).replace(/\.0$/,''):'—'}
function render(){
 const v=state.values;
 const put=(id,txt)=>{if($(id))$(id).textContent=txt};
 put('dashrpm',format(v['0C'],0));put('dashspeed',format(v['0D'],0));put('dashcoolant',format(v['05'],0));put('dashboost',boostString());
 put('sport-rpm',format(v['0C'],0));put('sport-speed',format(v['0D'],0));
 put('sport-boost',boostString());put('sport-maf',format(v['10'],1));put('sport-fuel',format(v['5E'],1));put('sport-rail',format(v['23'],0));
 put('sport-load',format(v['04'],0));put('sport-moment',torqueString());put('sport-kw',powerString());
 put('supply',format(v['42'],2));put('sport-intake',format(v['0F'],0));
 $('ring').style.setProperty('--angle',Math.min(270,Math.max(0,(v['0C']||0)/5500*270))+'deg');
 $('streamstate').textContent=state.stream?'Мониторинг активен':'Остановлен';
}
function boostString(){const a=get('0B'),b=get('33');return Number.isFinite(a)&&Number.isFinite(b)?format((a-b)/100,2)+' bar':Number.isFinite(a)?format(a/100,2)+' bar abs':'—'}
function torqueNumber(){const a=get('62'),r=get('63');return Number.isFinite(a)&&Number.isFinite(r)?r*a/100:null}
function torqueString(){const x=torqueNumber();return x===null?'—':format(x,0)+' Н·м'}
function powerString(){const tq=torqueNumber(),rpm=get('0C');return tq!==null&&Number.isFinite(rpm)?format(tq*rpm/9549,1)+' кВт':'—'}
function renderSensors(){
 const el=$('sensors');el.innerHTML='';
 Object.entries(PIDS).forEach(([pid,[label,unit]])=>{
  const supported=state.supportChecked?state.supported.has(pid):null;
  const val=get(pid),row=document.createElement('div');row.className='kv';
  const left=document.createElement('span');left.textContent=label;const right=document.createElement('b');
  right.textContent=Number.isFinite(val)?format(val,pid==='0C'||pid==='0D'||pid==='05'?0:1)+' '+unit:(supported===false?'Не поддерживается':'—');
  row.append(left,right);el.append(row)
 });
}
function sample(){const s={t:Date.now(),rpm:get('0C'),boost:get('0B'),speed:get('0D')};state.history.push(s);if(state.history.length>90)state.history.shift();drawChart()}
function drawChart(){
 const canvas=$('graph');if(!canvas)return;
 const ratio=window.devicePixelRatio||1;const width=canvas.clientWidth,height=canvas.clientHeight;
 if(!width||!height)return;canvas.width=width*ratio;canvas.height=height*ratio;
 const c=canvas.getContext('2d');c.scale(ratio,ratio);c.clearRect(0,0,width,height);
 c.strokeStyle='#293b57';c.lineWidth=1;for(let i=1;i<4;i++){c.beginPath();c.moveTo(0,i*height/4);c.lineTo(width,i*height/4);c.stroke()}
 const lines=[['rpm','#60a5fa',5500],['boost','#2de0b5',300],['speed','#ffb454',220]];
 lines.forEach(([k,color,max])=>{c.beginPath();c.strokeStyle=color;c.lineWidth=2.5;let started=false;
  state.history.forEach((pt,i)=>{const v=pt[k];if(!Number.isFinite(v))return;const x=i/Math.max(1,89)*(width-8)+4,y=height-8-Math.max(0,Math.min(1,v/max))*(height-16);if(!started){c.moveTo(x,y);started=true}else c.lineTo(x,y)});c.stroke();
 });
}
function stopStream(){state.stream=false;state.streamToken++;render()}
async function startStream(){
 if(!state.connected)return;stopStream();
 if(state.supportChecked&&!COMMANDS.some(pid=>state.supported.has(pid))){toast('ЭБУ не сообщил поддерживаемых датчиков');return}
 state.stream=true;const token=state.streamToken;
 toast('Мониторинг запущен');render();
 while(state.stream&&state.connected&&token===state.streamToken){
  const pid=COMMANDS[state.streamIndex++%COMMANDS.length];
  if(state.supportChecked&&!state.supported.has(pid)){await new Promise(r=>setTimeout(r,90));continue;}
  try{await queryPID(pid);sample()}catch(e){log('PID '+pid+': '+e.message);if(!state.connected)break}
  await new Promise(r=>setTimeout(r,130));
 }
 state.stream=false;render()
}
function decodeDtc(a,b){
 const families=['P','C','B','U'];const f=families[(a>>6)&3];
 return f+((a>>4)&3).toString(16).toUpperCase()+(a&15).toString(16).toUpperCase()+(b>>4).toString(16).toUpperCase()+(b&15).toString(16).toUpperCase();
}
function parseDTC(raw,mode,label){
 const prefix=mode==='03'?'43':mode==='07'?'47':'4A';
 const bytes=responseBytes(raw,prefix);
 if(!bytes.length||bytes[0]!==parseInt(prefix,16))return [];
 let data=bytes.slice(1);
 // OBD reports usually carry a leading trouble-code count; remove if plausible.
 if(data.length&&data[0]<=6&&((data.length-1)%2===0||(data[0]>0&&data.length>=1+data[0]*2)))data=data.slice(1);
 const result=[];
 for(let i=0;i+1<data.length;i+=2){
  const a=data[i],b=data[i+1];
  if(a===0&&b===0)continue;
  // Trailing padding from CAN frames is ignored.
  result.push({code:decodeDtc(a,b),label});
 }
 return result;
}
function renderDTC(){
 const root=$('dtcs');root.innerHTML='';$('errorcount').textContent=String(state.dtcs.length);
 if(!state.dtcs.length){root.innerHTML='<div class="empty">Пока нет считанных ошибок. Нажми «Сканировать двигатель».</div>';return}
 state.dtcs.forEach(({code,label})=>{
  const el=document.createElement('div');el.className='dtc';
  const info=DB[code]||['Описание отсутствует в локальной базе','Проверь код вместе с моделью, годом и кодом двигателя. Причины требуют диагностики.'];
  const title=document.createElement('div');title.className='code';title.textContent=code+' · '+label;
  const desc=document.createElement('div');desc.className='desc';desc.textContent=info[0];
  const hint=document.createElement('div');hint.className='hint';hint.textContent='Возможные причины: '+info[1];
  const link=document.createElement('a');link.className='link';link.target='_blank';link.rel='noopener noreferrer';link.href='https://www.google.com/search?q='+encodeURIComponent('Audi '+state.profile+' '+code+' ошибка причины');link.textContent='Искать ошибку в Google ↗';
  el.append(title,desc,hint,link);root.append(el)
 });
}
async function scanEngine(){
 if(!state.connected)return;stopStream();$('scan').disabled=true;$('scanstatus').textContent='Сканирование двигателя…';state.dtcs=[];let successful=0;
 try{
  for(const [cmd,label] of [['03','Сохранённая'],['07','Ожидающая'],['0A','Постоянная']]){
   try{const rawOut=await run(cmd,9000);if(/NO DATA/i.test(rawOut)){log(cmd+': нет данных');successful++;continue}if(/UNABLE TO CONNECT|ERROR|STOPPED|\?/i.test(rawOut))throw Error(rawOut.trim());successful++;state.dtcs.push(...parseDTC(rawOut,cmd,label))}
   catch(e){log('DTC '+cmd+': '+e.message)}
  }
  const uniq=new Set();state.dtcs=state.dtcs.filter(d=>{const key=d.code+d.label;if(uniq.has(key))return false;uniq.add(key);return true});
  $('scanstatus').textContent=(successful===3?'Готово':'Частично: '+successful+'/3 запросов')+' · '+state.dtcs.length+' кодов (стандартный OBD-II)';
  renderDTC();
 }finally{$('scan').disabled=!state.connected}
}
async function identify(){
 if(!state.connected)return;stopStream();
 try{const v=await run('ATI');$('version').textContent=v.trim()||'—';
 const proto=await run('ATDP');$('protocol').textContent=proto.trim()||'—';state.protocol=proto.trim();
 const voltage=await run('ATRV');$('adaptervoltage').textContent=voltage.trim()||'—';
 }catch(e){log('Идентификация: '+e.message)}
}

function responseBytes(raw,service){
 // ELM327 replies may have ECHO, CAN headers, ISO-TP frame prefixes, or "0:" line indexes.
 const rows=raw.toUpperCase().split(/[\r\n]+/).map(x=>x.trim()).filter(Boolean);
 const data=[];
 for(let line of rows){
  if(/^(SEARCHING|BUS INIT|NO DATA|UNABLE TO CONNECT|STOPPED|ERROR|OK|\?)/.test(line))continue;
  if(/^(09(?:02|04|0A)|01[A-F0-9]{2}|03|07|0A)$/.test(line))continue;
  line=line.replace(/^\d{1,2}\s*:\s*/,'').trim();
  line=line.replace(/^(?:[A-F0-9]{3}|[A-F0-9]{8})\s+/,'').trim();
  const compact=line.replace(/\s+/g,'');
  if(!/^[0-9A-F]+$/.test(compact)||compact.length%2)continue;
  let bytes=compact.match(/../g).map(x=>parseInt(x,16));
  // ISO-TP: first frame (10 nn), consecutive frames (21, 22…), single frame (0n).
  if(bytes[0]>=0x10&&bytes[0]<=0x1F&&bytes.length>2)bytes=bytes.slice(2);
  else if(bytes[0]>=0x20&&bytes[0]<=0x2F&&bytes.length>1)bytes=bytes.slice(1);
  else if(bytes[0]>0&&bytes[0]<=7&&bytes.length>1&&bytes[1]===parseInt(service,16))bytes=bytes.slice(1);
  data.push(...bytes);
 }
 const svc=parseInt(service,16);
 const index=data.indexOf(svc);
 return index>=0?data.slice(index):[];
}
function parseVIN(raw){
 const bytes=responseBytes(raw,'49');
 const i=bytes.findIndex((v,k)=>v===0x49&&bytes[k+1]===0x02);
 if(i<0)return null;
 // 49 02 01 <17 ASCII bytes> is the standard response; some clones omit frame index.
 let payload=bytes.slice(i+2);
 if(payload[0]===0x01)payload=payload.slice(1);
 const candidates=payload.map(x=>String.fromCharCode(x)).join('').match(/[A-HJ-NPR-Z0-9]{17}/g)||[];
 return candidates.find(v=>/^[A-HJ-NPR-Z0-9]{17}$/.test(v))||null;
}
function parseECUName(raw){
 const bytes=responseBytes(raw,'49');const i=bytes.findIndex((v,k)=>v===0x49&&bytes[k+1]===0x0A);
 if(i<0)return null;
 let payload=bytes.slice(i+2);if(payload[0]===0x01)payload.shift();
 const name=payload.map(x=>String.fromCharCode(x)).join('').replace(/[^\x20-\x7E]/g,'').trim();
 return name?name.slice(0,48):null;
}
function parseCalID(raw){
 const bytes=responseBytes(raw,'49');const i=bytes.findIndex((v,k)=>v===0x49&&bytes[k+1]===0x04);
 if(i<0)return null;
 let payload=bytes.slice(i+2);if(payload[0]===0x01)payload.shift();
 const name=payload.map(x=>String.fromCharCode(x)).join('').replace(/[^\x20-\x7E]/g,'').trim();
 return name?name.slice(0,48):null;
}
function makeFromVIN(vin){
 if(!vin)return null;
 const wmi=vin.slice(0,3);
 const brands={'WAU':'Audi','WVW':'Volkswagen','TMB':'Škoda','VSS':'SEAT','TRU':'Audi','WUA':'Audi','WV1':'Volkswagen Commercial','WV2':'Volkswagen Commercial','WVG':'Volkswagen'};
 return brands[wmi]||null;
}
function updateIdentity(){
 const v=state.vin;
 $('autovin').textContent=v||'Нет данных';
 $('settingsvin').textContent=v||'—';
 $('automake').textContent=makeFromVIN(v)||'Не определена';
 $('automodel').textContent='Не определяется по стандартному OBD';
 $('autoengine').textContent='Код двигателя не доступен';
 $('autoecuname').textContent=state.ecuName||'—';
 $('autocalid').textContent=state.calId||'—';
 $('vinstatus').textContent=v?'VIN прочитан':'VIN недоступен';
 $('copyvin').disabled=!v;
}
async function identifyVehicle(){
 if(!state.connected)return;
 stopStream();
 const gen=state.generation;
 $('vinstatus').textContent='Чтение VIN…';
 for(const [cmd,key,parser] of [['0902','vin',parseVIN],['090A','ecuName',parseECUName],['0904','calId',parseCalID]]){
  if(!state.connected||gen!==state.generation)return;
  try{const answer=await run(cmd,8500);if(gen!==state.generation)return;state[key]=parser(answer);log(cmd+' → '+(state[key]?'данные получены':'не поддерживается / нет данных'));}
  catch(e){log(cmd+': '+e.message)}
  updateIdentity();
 }
 toast(state.vin?'VIN определён':'VIN не получен через стандартный OBD');
}

function exportReport(){
 const lines=['VAG Diagnostic · отчёт',new Date().toLocaleString('ru-RU'),'VIN: '+(state.vin||'не получен'),'ECU: '+(state.ecuName||'не получен'),'Calibration: '+(state.calId||'не получен'),'Профиль (ручной): '+state.profile,'Адаптер: '+($('device').textContent),'Протокол: '+state.protocol,'','Ошибки двигателя:'];
 for(const d of state.dtcs)lines.push(d.code+' ('+d.label+'): '+(DB[d.code]?.[0]||'Нет описания'));
 lines.push('','Значения:');for(const [pid,n] of Object.entries(state.values))lines.push(PIDS[pid][0]+': '+n+' '+PIDS[pid][1]);
 const blob=new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='VAG-report-'+new Date().toISOString().slice(0,10)+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function bind(){
 $('connect').onclick=connect;$('disconnect').onclick=()=>state.device?.gatt?.disconnect();$('readvin').onclick=identifyVehicle;$('copyvin').onclick=async()=>{if(!state.vin)return;try{await navigator.clipboard.writeText(state.vin);toast('VIN скопирован')}catch(e){toast('Копирование не удалось')}};
 $('probe').onclick=probe;$('scan').onclick=scanEngine;$('identify').onclick=identify;
 $('start').onclick=startStream;$('stop').onclick=stopStream;$('start-sport').onclick=startStream;$('stop-sport').onclick=stopStream;
 $('export').onclick=exportReport;$('copylog').onclick=async()=>{try{await navigator.clipboard.writeText($('log').textContent);toast('Журнал скопирован')}catch(e){toast('Не получилось скопировать')}};
 $('clearlog').onclick=()=>{$('log').textContent='';log('Журнал очищен')};
 $('vehicle').onchange=e=>{state.profile=e.target.value;localStorage.setItem('vag-profile',state.profile)};
 const saved=localStorage.getItem('vag-profile');if(saved){$('vehicle').value=saved;state.profile=saved}
 window.addEventListener('resize',drawChart);
 setConnection(false);updateIdentity();render();renderSensors();renderDTC();log('VAG Diagnostic · Pro — готов к подключению')
}
bind();
