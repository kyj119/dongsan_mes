#!/usr/bin/env node
// 바로빌 잔액·단가 조회 (corpNum별) — -26006 원인(포인트) 점검
const fs = require('fs');
const v = {};
for (const l of fs.readFileSync('C:\\Users\\user\\dongsan_mes\\.dev.vars', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) v[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const cert = v.BAROBILL_CERT_KEY_PROD, corp = String(process.argv[2] || '').replace(/-/g, '');
async function call(service, method, extra = '') {
  const env = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${method} xmlns="http://ws.baroservice.com/"><CERTKEY>${cert}</CERTKEY><CorpNum>${corp}</CorpNum>${extra}</${method}></soap:Body></soap:Envelope>`;
  const r = await fetch(`https://ws.baroservice.com/${service}.asmx`, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': `http://ws.baroservice.com/${method}` }, body: env });
  const t = await r.text();
  const f = t.match(/<faultstring>(.*?)<\/faultstring>/s); if (f) return 'FAULT: ' + f[1].slice(0, 120);
  const m = t.match(new RegExp(`<${method}Result>([\\s\\S]*?)</${method}Result>`)); return m ? m[1] : t.slice(0, 200);
}
(async () => {
  console.log(`[corp ${corp}]`);
  console.log('  SMS 잔액(GetBalanceCostAmount):', await call('SMS', 'GetBalanceCostAmount'));
  console.log('  알림톡 잔액(KakaoTalk GetBalanceCostAmount):', await call('KakaoTalk', 'GetBalanceCostAmount'));
  console.log('  알림톡 단가(GetChargeUnitCost ST=3):', await call('KakaoTalk', 'GetChargeUnitCost', '<ID></ID><ServiceType>3</ServiceType>'));
})().catch(e => console.error(e));
