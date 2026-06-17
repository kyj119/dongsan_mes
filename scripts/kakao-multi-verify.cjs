#!/usr/bin/env node
/**
 * 바로빌 알림톡 멀티계정 검증 (파트너 단일 CERTKEY + 법인별 corpNum)
 *
 * 기본: 채널·승인템플릿 조회만 (발송 안 함 — 안전).
 * --send 플래그가 있을 때만 실제 알림톡 발송.
 *
 * 사용:
 *   조회:  node scripts/kakao-multi-verify.cjs --corp <사업자번호> --prod
 *   발송:  node scripts/kakao-multi-verify.cjs --corp <사업자번호> --prod \
 *            --send --to <수신번호> --name <수신자명> --template <템플릿코드> \
 *            --msg "<본문>" [--snd <발신번호>] [--sender <연동회원ID>]
 *
 * CERTKEY는 메인 repo의 .dev.vars에서 읽음 (--prod → BAROBILL_CERT_KEY_PROD).
 */
const fs = require('fs');
const path = require('path');

function loadDevVars() {
  const candidates = [
    path.join('C:\\Users\\user\\dongsan_mes', '.dev.vars'),
    path.join(process.cwd(), '.dev.vars'),
  ];
  const vars = {};
  for (const f of candidates) {
    if (fs.existsSync(f)) {
      for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
        if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
      break;
    }
  }
  return vars;
}

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return (v && !v.startsWith('--')) ? v : true;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function soap(base, service, method, bodyInner) {
  const env = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body><${method} xmlns="http://ws.baroservice.com/">${bodyInner}</${method}></soap:Body>
</soap:Envelope>`;
  const resp = await fetch(`${base}/${service}.asmx`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': `http://ws.baroservice.com/${method}` },
    body: env,
  });
  return await resp.text();
}

function extract(xml, tag) {
  const s = xml.indexOf(`<${tag}>`), e = xml.indexOf(`</${tag}>`);
  return (s >= 0 && e >= 0) ? xml.slice(s + tag.length + 2, e) : null;
}
function fault(xml) {
  const m = xml.match(/<faultstring>(.*?)<\/faultstring>/s);
  return m ? m[1] : null;
}

(async () => {
  const vars = loadDevVars();
  const isProd = !!arg('prod', false);
  const certKey = isProd ? vars.BAROBILL_CERT_KEY_PROD : vars.BAROBILL_CERT_KEY;
  const base = isProd ? 'https://ws.baroservice.com' : 'https://testws.baroservice.com';
  const corpNum = String(arg('corp', '')).replace(/-/g, '');
  if (!certKey) { console.error('✗ CERTKEY 없음 (.dev.vars 확인)'); process.exit(1); }
  if (!corpNum) { console.error('✗ --corp <사업자번호> 필요'); process.exit(1); }

  console.log(`[mode] ${isProd ? 'PROD(운영)' : 'TEST'}  base=${base}  corp=${corpNum}`);

  // 1) 발신 채널(발신프로필) 조회 — 파트너키로 해당 corpNum 연결 검증
  const chXml = await soap(base, 'KakaoTalk', 'GetKakaotalkChannels',
    `<CERTKEY>${esc(certKey)}</CERTKEY><CorpNum>${esc(corpNum)}</CorpNum>`);
  const f1 = fault(chXml);
  if (f1) { console.error('✗ [채널조회 FAULT]', f1); process.exit(2); }
  const channels = [];
  const re = /<KakaotalkChannel>(.*?)<\/KakaotalkChannel>/gs;
  let m;
  while ((m = re.exec(chXml))) {
    const b = m[1];
    channels.push({ id: extract(b, 'ChannelId'), name: extract(b, 'ChannelName'), status: extract(b, 'Status') });
  }
  console.log(`\n[채널 ${channels.length}개]`);
  channels.forEach(c => console.log(`  - ${c.id} (${c.name}) status=${c.status}`));
  if (channels.length === 0) console.log('  (raw 응답 일부)', chXml.replace(/\s+/g, ' ').slice(0, 500));

  // 2) 채널별 승인 템플릿 조회
  for (const ch of channels) {
    if (!ch.id) continue;
    const tXml = await soap(base, 'KakaoTalk', 'GetKakaotalkTemplates',
      `<CERTKEY>${esc(certKey)}</CERTKEY><CorpNum>${esc(corpNum)}</CorpNum><ChannelId>${esc(ch.id)}</ChannelId>`);
    const tf = fault(tXml);
    if (tf) { console.log(`  채널 ${ch.id} 템플릿조회 FAULT: ${tf}`); continue; }
    const tps = [];
    const tre = /<KakaotalkTemplate>(.*?)<\/KakaotalkTemplate>/gs;
    let tm;
    while ((tm = tre.exec(tXml))) {
      const b = tm[1];
      tps.push({ name: extract(b, 'TemplateName'), status: extract(b, 'Status'), content: (extract(b, 'TemplateContent') || '').replace(/\s+/g, ' ').slice(0, 80) });
    }
    console.log(`\n[채널 ${ch.id} 템플릿 ${tps.length}개]  (status 3=승인)`);
    tps.forEach(t => console.log(`  - ${t.name}  status=${t.status}  | ${t.content}`));
  }

  // 3) 실발송 (옵션 — --send 있을 때만)
  if (arg('send', false)) {
    const to = String(arg('to', ''));
    const name = String(arg('name', '테스트'));
    const tmpl = String(arg('template', ''));
    const snd = String(arg('snd', ''));
    const sender = String(arg('sender', ''));
    const msg = String(arg('msg', ''));
    if (!to || !tmpl || !msg) { console.error('\n✗ [발송] --to, --template, --msg 모두 필요'); process.exit(3); }
    console.log(`\n[실발송 시도] to=${to} template=${tmpl} sender=${sender || '(빈값)'} snd=${snd || '(빈값)'}`);
    const body = `<CERTKEY>${esc(certKey)}</CERTKEY><CorpNum>${esc(corpNum)}</CorpNum><SenderID>${esc(sender)}</SenderID><TemplateName>${esc(tmpl)}</TemplateName><SendDT></SendDT><SmsReply>N</SmsReply><SmsSenderNum>${esc(snd)}</SmsSenderNum><KakaotalkMessage><ReceiverName>${esc(name)}</ReceiverName><ReceiverNum>${esc(to)}</ReceiverNum><Title></Title><Message>${esc(msg)}</Message><SmsMessage></SmsMessage></KakaotalkMessage>`;
    const sXml = await soap(base, 'KakaoTalk', 'SendATKakaotalk', body);
    const sf = fault(sXml);
    const res = extract(sXml, 'SendATKakaotalkResult');
    console.log('[발송결과]', sf ? ('FAULT: ' + sf) : res);
    console.log('(raw)', sXml.replace(/\s+/g, ' ').slice(0, 400));
  } else {
    console.log('\n(발송 생략 — 조회 전용. 실발송: --send --to <번호> --template <코드> --msg "<본문>" [--sender <ID>] [--snd <발신번호>])');
  }
})().catch(e => { console.error('ERROR', e); process.exit(99); });
