const fs=require('fs')
const mes=JSON.parse(fs.readFileSync('mesall.json','utf8'))
const ec=JSON.parse(fs.readFileSync('stock_parsed.json','utf8')).items
const byCode={}; for(const m of mes) byCode[m.code]=m
const byName={}; for(const m of mes) (byName[m.nm]=byName[m.nm]||[]).push(m)

// ① 품목명 → MES 품목명 (규격으로 다시 좁힘)
const NAME={
 '현수막 1코팅':'수성 현수막원단 1코팅','현수막 2코팅':'수성 현수막원단 2코팅','솔벤 현수막':'솔벤 현수막',
 '저밀도 현수막':'수성 현수막원단 저밀도','저밀도 게릴라 현수막':'수성 현수막원단 저밀도',
 '친환경 현수막-eco':'친환경 현수막원단 eco','친환경 현수막- GRS':'친환경 현수막원단 GRS','친환경 현수막':'친환경 현수막원단 TPM',
 '합성지(30m)-호홍':'합성지 30M 호홍','합성지 그레이(30m)-호홍':'합성지그레이 30M 호홍',
 'PVC(켈)(30m)-호홍':'켈 30M 호홍','PVC(켈) 그레이(30m)-호홍':'켈그레이 30M 호홍','패트배너(30m)-호홍':'패트배너 30M 호홍',
 'PVC(켈)(30m)-잉크테크':'켈 30M 잉크테크','PVC(켈) 그레이(30m)-잉크테크':'켈그레이 30M 잉크테크','패트배너(30m)-잉크테크':'패트배너 30M 잉크테크',
 '합성지-프라임':'합성지-프라임','합성지 그레이-프라임':'합성지 그레이-프라임','PVC(켈)-프라임':'PVC(켈)-프라임','PVC(켈) 그레이-프라임':'PVC(켈) 그레이-프라임','패트배너-프라임':'패트배너-프라임',
 '무광 코팅지 자동용(45m/180g)-호홍':'무광코팅지 180g-호홍','무광코팅지 일반엠보(45m/180g)':'무광코팅지 180g-호홍',
 '무광 코팅지 자동용(61m/120g)-호홍':'무광코팅지 120g-호홍','무광 코팅지 자동용(45m/120g)-호홍':'무광코팅지 120g-호홍',
 'UV무광코팅지(45m/200g)-코인텍':'UV무광코팅지(45m/200g)-코인텍','무광 코팅지 일반 (45m/200g)-코인텍':'무광코팅지 일반(45m/200g)-코인텍',
 '솔벤 텐트천(300D)':'솔벤 텐트천','수성 텐트천':'수성 텐트천','부직포':'부직포',
 '솔벤패트배너-나투라':'나투라 솔벤패트','솔벤매쉬-배너':'솔벤 매쉬','고밀도 폰지':'폰지',
 '포맥스-중국산':'포맥스 예스(중국산)','고무자석시트-일반(0.8T)':'고무자석시트','고무자석시트-차량용(0.8T)':'고무자석시트',
 '백릿-수성(30m)-호홍':'수성 백릿-호홍','백릿(30m)-아누코':'수성 백릿-호홍','수성 백릿-프라임':'수성 백릿-호홍','백릿-멀티(30m)/솔벤-호홍':'멀티 백릿-호홍',
 '원형나무':'원형나무',
}
// ② 전체명(규격포함) → MES 코드 직접지정
const CODE={
 '/SPM011M|105폭':'','SPM011M|105폭':'SPM011M','SPM011M|127폭':'SPM011M',
 '엡손 솔벤잉크(80610)|BK':'RM-I0078','엡손 솔벤잉크(80610)|C':'RM-I0075','엡손 솔벤잉크(80610)|M':'RM-I0076',
 '엡손 솔벤잉크(80610)|Y':'RM-I0077','엡손 솔벤잉크(80610)|LC':'RM-I0079','엡손 솔벤잉크(80610)|LM':'RM-I0080','엡손 솔벤잉크(80610)|CL':'RM-I0081',
'수성잉크 C|5L':'RM-I-TPM-C-5L','수성잉크 M|5L':'RM-I-TPM-M-5L','수성잉크 Y|5L':'RM-I-TPM-Y-5L','수성잉크 K|5L':'RM-I-TPM-K-5L',
'수성잉크 C|20L':'RM-I-TPM-C-20L','수성잉크 M|20L':'RM-I-TPM-M-20L','수성잉크 Y|20L':'RM-I-TPM-Y-20L','수성잉크 K|20L':'RM-I-TPM-K-20L',
 '포맥스-중국산|5T 4x8':'SK-2822','포맥스-중국산|10T 4x8':'SK-2824',
 '수성 백릿-프라임|127폭':'PJ-BACKLIT-P127',
 '족자봉 쫄대|5mm':'ACC-JJ-ZD5','앙고리폴대|':'ACC-018','4mm볼로프|':'ACC-037-4MM','5mm볼로프|':'ACC-037-5MM',
 '큐방-원터치|40￠/1봉(250개)':'ACC-047-OT','압축큐방-차량용|백색/검정(73Ø)':'ACC-047-AP-73',
 '판형 삼각접착고리|12Ø':'ACC-050-P12','판형 삼각접착고리|무펀치':'ACC-050-NP',
 '아일렛(하도매)|24호/은색':'ACC-045-24-S','아일렛(하도매)|20호/은색':'ACC-045-20-S','아일렛(하도매)-와셔|24호/은색':'ACC-045-24-S','아일렛(하도매)-수형|24호/은색':'ACC-045-24-S','아일렛(하도매)|24호/금색':'ACC-045-24-G','아일렛(하도매)|9호/은색':'ACC-045-9-S',
 '아일렛(하도매)|5호/은색':'ACC-045-5-S','아일렛(하도매)|5호/금색':'ACC-045-5-G',
 '자동몰드|9호':'ACC-MOLD-9','하도매 자동몰드|24호(12파이)':'ACC-MOLD-24','하도매 기계(손기계)|수동':'GDS-HDMGI','인두기(열재단)|나무손잡이':'GDS-INDUGI',
 '실내배너 일자형(W)|60*180':'ACC-BN-STR','원터치배너-그레이|60*180':'GDS-OTB-GR',
 '실내용 철제배너-TS|60*180':'ACC-028','실내용 철제배너-TS|50*150':'ACC-028','실외용 철제배너-TSO(브랏켓형)|60*180':'ACC-026',
 '윈드배너 물통형-SET(소)|76*180':'ACC-017','자이언트 폴SET(대)|6m/120*400':'ACC-023','실외배너 물통SET(복배너)|60*180':'ACC-011',
 '비점착합성지(30m)-호홍|127폭':'SYN-NA-127','솔벤용 코팅지-50m|127폭':'SVCOAT-127',
 '솔벤 블랙아웃 패트배너|127':'PAT-BO-127','3M시트-IJ35C-10|137폭/50m':'IJ35C-137',
 'LD59THG|137폭':'LD59HTG-137','SPE032G|137폭':'SPE032G-137','울트라보조시트|100폭/50m/75g':'ULTRA-BOJO-100',
 '포맥스-중국산|4*8(5T)':'FMX-YES-5T-48','포맥스-중국산|4*8(10T)':'FMX-YES-10T-48','합성지(30m)-잉크테크|127폭':'SYN-IT-127',
'수성잉크 C|':'RM-I0001','수성잉크 M|':'RM-I0002','수성잉크 Y|':'RM-I0003','수성잉크 K|':'RM-I0004','수성잉크 LC|':'RM-I0005','수성잉크 LM|':'RM-I0006',
}
const SUF=/-\s*(J|S|TPM|호홍|아누코|프라임|코인텍|잉크테크|eco|GRS|삼원|한성|나투라|중국산)\s*$/
const parse=n=>{const m=n.match(/^(.*?)\s*\[(.+?)\]\s*$/); const raw=m?m[1].trim():n.trim(); const spec=m?m[2].trim():'';
  return {raw, base:raw.replace(SUF,'').trim(), spec, maker:(raw.match(SUF)||[])[1]||''}}
const sn=s=>{const m=String(s).match(/(\d+)\s*(폭|cm)/); return m?+m[1]:null}
const isCode=s=>/^[A-Z0-9]{4,10}$/.test(s)
function pick(pool, spec){
  const w=sn(spec)
  if(w!=null){ let h=pool.find(c=>sn(c.spec)===w); if(h) return [h,'정확']
    const n=pool.map(c=>({c,d:Math.abs((sn(c.spec)??9999)-w)})).sort((a,b)=>a.d-b.d)[0]
    if(n&&n.d<=3) return [n.c,'근사'+n.d+'cm']
    return [null,''] }
  if(spec){ let h=pool.find(c=>(c.spec||'').replace(/\s/g,'').includes(spec.replace(/[\s()]/g,'').slice(0,4))); if(h) return [h,'규격문자'] }
  if(pool.length===1) return [pool[0],'단일']
  return [null,'']
}
const out=[]
for(const x of ec){
  const p=parse(x.name); let hit=null, how=''
  if(byName[p.raw]){ const r=pick(byName[p.raw], p.spec); if(r[0]){ hit=r[0]; how='동일명'+(r[1]==='정확'?'':'/'+r[1]) } }
  const ck=hit?null:CODE[p.raw+'|'+p.spec]
  if(ck && byCode[ck]){ hit=byCode[ck]; how='지정' }
  if(!hit){ const t=NAME[p.raw]||NAME[p.base]; if(t&&byName[t]) [hit,how]=pick(byName[t], p.spec) }
  if(!hit && isCode(p.base)){ const pool=mes.filter(m=>m.nm.includes(p.base)); if(pool.length) [hit,how]=pick(pool,p.spec), how=how&&'코드명' }
  if(!hit){ const pool=mes.filter(m=>m.nm.replace(/\s/g,'').includes(p.base.replace(/\s/g,''))); if(pool.length) { const r=pick(pool,p.spec); if(r[0]) [hit,how]=[r[0],'이름포함'] } }
  out.push({...x, ...p, mes:hit, how,
    cands: mes.filter(m=>m.nm.replace(/\s/g,'').includes(p.base.replace(/\s/g,'').slice(0,3))).slice(0,4)
      .map(c=>`${c.code} ${c.nm}${c.spec?' ['+c.spec+']':''}`).join(' || ')})
}
const ok=out.filter(o=>o.mes)
const q=out.reduce((a,o)=>a+Math.abs(o.close||0),0), oq=ok.reduce((a,o)=>a+Math.abs(o.close||0),0)
console.log('매칭',ok.length,'/',out.length,'('+(ok.length/out.length*100).toFixed(1)+'%) · 수량기준',(oq/q*100).toFixed(1)+'%')
const h={}; ok.forEach(o=>h[o.how]=(h[o.how]||0)+1); console.log('방식:',h)
console.log('\n미매칭',out.length-ok.length,'건:')
out.filter(o=>!o.mes).sort((a,b)=>Math.abs(b.close||0)-Math.abs(a.close||0)).forEach(o=>console.log('  '+String(o.close).padStart(6), o.code.padEnd(9), o.name))
fs.writeFileSync('match3.json', JSON.stringify(out))
