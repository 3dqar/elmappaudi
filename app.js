'use strict';
const $=id=>document.getElementById(id);
const UUIDS=['0000fff0-0000-1000-8000-00805f9b34fb','0000ffe0-0000-1000-8000-00805f9b34fb','0000ffe5-0000-1000-8000-00805f9b34fb','0000ffb0-0000-1000-8000-00805f9b34fb','000018f0-0000-1000-8000-00805f9b34fb','6e400001-b5a3-f393-e0a9-e50e24dcca9e'];
const state={device:null,server:null,tx:null,rx:null,connected:false,pending:null,buffer:'',queue:Promise.resolve(),stream:false,streamToken:0,streamIndex:0,values:{},supported:new Set(),supportChecked:false,dtcs:[],protocol:'—',history:[],lastData:0,unsupported:new Set(),misses:{},pollCount:0,sportMode:true,lastDraw:0,ambientRef:null,ambientKind:'estimated',pidTime:{},voltage:null,voltageAt:0,vin:null,ecuName:null,calId:null,generation:0,profile:'Audi A4 B7 · 2.0 TDI'};
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
// Prioritize RPM, boost and speed instead of polling every PID in a slow round-robin.
const FAST_PIDS=['0C','0B','0D','10','04'];
const SLOW_PIDS=['05','0F','33','42','23','5E','2F','5C','62','63','61','11'];
const COMMANDS=[...FAST_PIDS,...SLOW_PIDS];
const MAX_MISSES=2;
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
function page(name){
 const wasSport=state.sportMode;
 state.sportMode=name==='sport';
 document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.id==='page-'+name));
 document.querySelectorAll('nav button').forEach(el=>el.classList.toggle('active',el.dataset.page===name));
 window.scrollTo({top:0,behavior:'instant'});
 if(name==='sport'){drawChart();if(state.connected&&!wasSport)void startStream();}
 else {if(wasSport&&state.stream)stopStream();if(name==='sensors')renderSensors();}
}
document.querySelectorAll('nav button').forEach(el=>el.addEventListener('click',()=>page(el.dataset.page)));
function onDisconnect(){state.generation++;stopStream();state.ambientRef=null;state.pidTime={};state.voltage=null;state.voltageAt=0;if(state.pending){clearTimeout(state.pending.timer);state.pending.reject(Error('BLE отключился'));state.pending=null}state.server=null;state.tx=null;state.rx=null;state.vin=null;state.ecuName=null;state.calId=null;state.values={};state.supported.clear();state.unsupported.clear();state.misses={};state.supportChecked=false;setConnection(false);$('device').textContent='—';$('bleprofile').textContent='—';$('ecustatus').textContent='ЭБУ ещё не проверен';$('pidcount').textContent='—';$('scanstatus').textContent='Ожидание подключения';updateIdentity();render();renderSensors();log('Соединение разорвано');}
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
 state.generation++;state.vin=null;state.ecuName=null;state.calId=null;state.supported.clear();state.unsupported.clear();state.misses={};state.pidTime={};state.ambientRef=null;state.voltage=null;state.voltageAt=0;state.pollCount=0;state.supportChecked=false;state.values={};state.history=[];state.dtcs=[];updateIdentity();renderDTC();renderSensors();render();setConnection(true);log('Подключено. BLE '+$('bleprofile').textContent);
 await run('ATI',4000);await run('ATE0',3000);await run('ATL0',3000);await run('ATS0',3000);await run('ATH0',3000);await run('ATSP0',3000);
 toast('Адаптер подключён');void identifyVehicle().then(()=>{if(state.connected&&state.sportMode)void startStream()});
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
  const out=await raw(command,timeout);
  if(!(state.stream&&/^01(?:0C|0B|0D|10|04|05|0F)$/.test(command))){
    log('→ '+command+'  ← '+out.replace(/[\r\n]+/g,' | ').slice(0,230));
  }
  return out;
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
function setMetric(pid,value){state.values[pid]=value;state.pidTime[pid]=Date.now();state.lastData=Date.now();render();if(document.getElementById('page-sensors').classList.contains('active'))renderSensors();}
async function queryPID(pid){
 const out=await run('01'+pid);
 if(/NO DATA|UNABLE TO CONNECT|STOPPED|ERROR|\?/i.test(out)){state.misses[pid]=(state.misses[pid]||0)+1;if(state.misses[pid]>=MAX_MISSES)state.unsupported.add(pid);if(document.getElementById('page-sensors').classList.contains('active'))renderSensors();render();return null;}
 const bytes=payload(out,'41',pid);
 if(!bytes||!PIDS[pid]){state.misses[pid]=(state.misses[pid]||0)+1;if(state.misses[pid]>=MAX_MISSES)state.unsupported.add(pid);renderSensors();render();return null;}
 if(bytes.length<(new Set(['0C','10','23','42','5E','63']).has(pid)?2:1))return null;
 const n=PIDS[pid][2](bytes);
 if(Number.isFinite(n)){state.misses[pid]=0;state.unsupported.delete(pid);setMetric(pid,n);return n}
 return null;
}
async function probe(){
 if(!state.connected)return;stopStream();state.supported.clear();state.unsupported.clear();state.misses={};state.supportChecked=false;$('ecustatus').textContent='Проверка…';
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
 const display=(pid,dec=1)=>Number.isFinite(v[pid])?format(v[pid],dec):(state.unsupported.has(pid)||(state.supportChecked&&!state.supported.has(pid))?'н/д':'—');
 put('dashrpm',display('0C',0));put('dashspeed',display('0D',0));put('dashcoolant',display('05',0));put('dashboost',boostString());
 put('sport-rpm',display('0C',0));put('sport-speed',display('0D',0));
 put('sport-boost',boostString());put('sport-maf',display('10',1));put('sport-fuel',display('5E',1));put('sport-rail',display('23',0));
 put('sport-load',display('04',0));put('sport-moment',torqueString());put('sport-kw',powerString());
 put('supply',display('42',2));put('sport-voltage',Number.isFinite(state.voltage)?format(state.voltage,2):display('42',2));put('sport-intake',display('0F',0));put('sport-coolant',display('05',0));put('sport-map',Number.isFinite(v['0B'])?format(v['0B']/100,2):'—');
 const source=$('boost-source');if(source)source.textContent=boostSource();
 const booster=$('boost-label');if(booster)booster.textContent=boostBase().kind==='Оценка 101.3 кПа'?'ESTIMATED':'CALIBRATED';
 const fill=(id,value,max)=>{const el=$(id);if(el)el.style.width=Number.isFinite(value)?Math.max(0,Math.min(100,value/max*100))+'%':'0%'};
 const map=get('0B');const base=boostBase().kpa;
 fill('boost-fill',Number.isFinite(map)?Math.max(0,(map-base)/100):null,2.1);
 fill('speed-fill',get('0D'),240);fill('maf-fill',get('10'),180);fill('load-fill',get('04'),100);
 fill('intake-fill',get('0F'),100);fill('coolant-fill',get('05'),125);fill('map-fill',get('0B'),300);
 fill('voltage-fill',state.voltage,16);
 const sportDev=$('sport-device');if(sportDev)sportDev.textContent=state.connected?'OBDII · ELM327 CONNECTED':'OBDII · OFFLINE';
 const sportPower=$('sport-connect');if(sportPower){sportPower.textContent=state.connected?'ONLINE':'CONNECT';sportPower.disabled=state.connected}

 const live=$('sport-live');if(live){live.textContent=state.connected?(state.stream?'● LIVE':'● ONLINE'):'● OFFLINE';live.classList.toggle('live',state.connected&&state.stream)}
 const fresh=$('sport-freshness');if(fresh){const latest=state.pidTime['0C'];fresh.textContent=!state.connected?'ELM327 не подключён':!latest?'Ожидание оборотов':(Date.now()-latest>2000?'Данные устарели':'RPM · '+Math.round(Date.now()-latest)+' мс назад')}
 $('ring').style.setProperty('--angle',Math.min(270,Math.max(0,(v['0C']||0)/5500*270))+'deg');
 $('streamstate').textContent=state.stream?'Мониторинг активен':'Остановлен';
}
function boostBase(){const baro=get('33');return Number.isFinite(baro)?{kpa:baro,kind:'ECU BARO'}:Number.isFinite(state.ambientRef)?{kpa:state.ambientRef,kind:'Калибровано'}:{kpa:101.3,kind:'Оценка 101.3 кПа'}}
function boostString(){
 const map=get('0B');
 if(!Number.isFinite(map))return '—';
 const ref=boostBase();
 const excess=(map-ref.kpa)/100;
 return (ref.kind==='Оценка 101.3 кПа'?'≈':'')+format(Math.max(0,excess),2);
}
function boostSource(){if(!Number.isFinite(get('0B')))return 'Ожидание датчика MAP';const b=boostBase();return b.kind==='Оценка 101.3 кПа'?'≈ по стандартной атмосфере · нажми калибровку':b.kind==='ECU BARO'?'Реальное BARO по ЭБУ':'Ноль откалиброван при заглушенном моторе'}
function zeroBoost(){
 const rpm=get('0C'),map=get('0B');
 if(!state.connected||!Number.isFinite(map)){toast('Сначала подключи ЭБУ и дождись MAP');return}
 if(!Number.isFinite(rpm)||rpm>50){toast('Для калибровки заглуши мотор, зажигание оставь включённым');return}
 if(map<75||map>110){toast('MAP вне диапазона атмосферного давления — проверь датчик');return}
 state.ambientRef=map;render();toast('Ноль установлен: '+map+' kPa');
}
function torqueNumber(){const a=get('62'),r=get('63');return Number.isFinite(a)&&Number.isFinite(r)?r*a/100:null}
function torqueString(){const x=torqueNumber();return x===null?'—':format(x,0)+' Н·м'}
function powerString(){const tq=torqueNumber(),rpm=get('0C');return tq!==null&&Number.isFinite(rpm)?format(tq*rpm/9549,1)+' кВт':'—'}
function renderSensors(){
 const el=$('sensors');el.innerHTML='';
 Object.entries(PIDS).forEach(([pid,[label,unit]])=>{
  const supported=state.supportChecked?state.supported.has(pid):null;
  const val=get(pid),row=document.createElement('div');row.className='kv';
  const left=document.createElement('span');left.textContent=label;const right=document.createElement('b');
  right.textContent=Number.isFinite(val)?format(val,pid==='0C'||pid==='0D'||pid==='05'?0:1)+' '+unit:(supported===false||state.unsupported.has(pid)?'Нет данных от ЭБУ':'Ожидание');
  row.append(left,right);el.append(row)
 });
}
function sample(){
 const now=Date.now();
 if(now-state.lastDraw<140)return;
 state.lastDraw=now;
 state.history.push({t:now,rpm:get('0C'),boost:get('0B'),speed:get('0D')});
 if(state.history.length>90)state.history.shift();
 if(state.sportMode)drawChart();
}
function drawChart(){
 const canvas=$('graph');
 if(!canvas||!state.sportMode)return;
 const width=canvas.clientWidth,height=canvas.clientHeight;
 if(width<10||height<10)return;
 const ratio=Math.min(window.devicePixelRatio||1,2);
 const w=Math.round(width*ratio),h=Math.round(height*ratio);
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
 const c=canvas.getContext('2d');if(!c)return;
 c.setTransform(ratio,0,0,ratio,0,0);c.clearRect(0,0,width,height);
 c.strokeStyle='#254065';c.lineWidth=1;
 for(let i=1;i<4;i++){c.beginPath();c.moveTo(0,height*i/4);c.lineTo(width,height*i/4);c.stroke()}
 const lines=[['rpm','#619fff',5000],['boost','#36e4b6',280]];
 for(const [key,color,max] of lines){
  c.beginPath();c.strokeStyle=color;c.lineWidth=1.9;
  let begun=false;
  const arr=state.history;
  for(let i=0;i<arr.length;i++){
   const val=arr[i][key];if(!Number.isFinite(val))continue;
   const x=i/Math.max(1,89)*(width-5)+2.5;
   const y=height-3-Math.max(0,Math.min(1,val/max))*(height-6);
   if(!begun){c.moveTo(x,y);begun=true}else c.lineTo(x,y);
  }
  if(begun)c.stroke();
 }
}
function stopStream(){state.stream=false;state.streamToken++;render()}
async function startStream(){
 if(!state.connected)return;
 stopStream();
 const sport=state.sportMode;
 const primary=sport?['0C','0B','0C','0D','0B','0C']:FAST_PIDS;
 const secondary=sport?['10','04','05','0F','33']:SLOW_PIDS;
 const available=pid=>(!state.supportChecked||state.supported.has(pid))&&!state.unsupported.has(pid);
 if(![...primary,...secondary].some(available)){toast('Нет доступных датчиков двигателя');return}
 state.stream=true;
 const token=state.streamToken;
 let fastIndex=0,slowIndex=0,cycle=0;
 toast(sport?'SPORT: быстрый опрос оборотов и наддува':'Мониторинг запущен');
 render();
 while(state.stream&&state.connected&&token===state.streamToken){
   // Adapter voltage is read only occasionally, never after every live PID.
   if(sport&&cycle>0&&cycle%35===0&&Date.now()-state.voltageAt>4500){
     state.voltageAt=Date.now();
     try{
       const v=await run('ATRV',3500);
       const m=v.match(/(\d{1,2}(?:\.\d{1,2})?)\s*V/i);
       if(m){const n=Number(m[1]);if(n>=8&&n<=19){state.voltage=n;render()}}
     }catch(e){log('Voltage: '+e.message)}
   }
   const slow=cycle++%(sport?12:8)===(sport?11:7);
   const candidates=(slow?secondary:primary).filter(available);
   if(!candidates.length){
     if(![...primary,...secondary].some(available))break;
     continue;
   }
   const pid=candidates[(slow?slowIndex++:fastIndex++)%candidates.length];
   try{await queryPID(pid);if(token!==state.streamToken)break;sample()}
   catch(e){
     if(token!==state.streamToken||!state.connected)break;
     log('PID '+pid+': '+e.message);
     state.misses[pid]=(state.misses[pid]||0)+1;
     if(state.misses[pid]>=MAX_MISSES)state.unsupported.add(pid);
   }
   // ELM327 is sequential; responses determine actual refresh speed.
   // No artificial inter-command delay in Sport mode.
   if(!sport)await new Promise(resolve=>setTimeout(resolve,15));
 }
 if(token===state.streamToken){state.stream=false;render()}
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
 $('start').onclick=()=>{state.sportMode=false;startStream()};$('stop').onclick=stopStream;$('start-sport').onclick=()=>{state.sportMode=true;startStream()};$('stop-sport').onclick=stopStream;
 $('sport-connect').onclick=()=>state.connected?toast('ELM327 уже подключён'):connect();$('sport-menu').onclick=()=>page('home');$('zeroBoost').onclick=zeroBoost;
 $('export').onclick=exportReport;$('copylog').onclick=async()=>{try{await navigator.clipboard.writeText($('log').textContent);toast('Журнал скопирован')}catch(e){toast('Не получилось скопировать')}};
 $('clearlog').onclick=()=>{$('log').textContent='';log('Журнал очищен')};
 $('vehicle').onchange=e=>{state.profile=e.target.value;localStorage.setItem('vag-profile',state.profile)};
 const saved=localStorage.getItem('vag-profile');if(saved){$('vehicle').value=saved;state.profile=saved}
 window.addEventListener('resize',drawChart);
 setConnection(false);updateIdentity();render();renderSensors();renderDTC();page('sport');log('VAG Diagnostic · Pro — готов к подключению')
}
bind();
