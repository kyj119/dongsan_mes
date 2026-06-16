#!/usr/bin/env node
/**
 * 바로빌 알림톡 실발송 테스트 (파트너 단일 CERTKEY + 법인별 corpNum)
 *
 * 안전 설계:
 *  - 템플릿 원문을 바로빌 API에서 직접 조회 → #{변수}만 치환 → Message 구성
 *    (원문 줄바꿈/기호 그대로 보존하여 "템플릿 불일치" 거부 방지)
 *  - 미치환 변수가 남으면 발송 중단
 *
 * 사용:
 *   node scripts/kakao-send-test.cjs <corpNum> <senderID> <수신번호> [수신자명]
 *   (템플릿명·변수값은 CONFIG 상수, 수신번호는 인자로 받음 — PII 미커밋)
 */
const fs = require('fs');
const path = require('path');

// ── 발송 설정 (한글은 이 소스에 UTF-8로 고정) ──
const CONFIG = {
  to: String(process.argv[4] || '').replace(/-/g, ''),   // 수신번호 = 인자 (PII 미커밋)
  receiverName: process.argv[5] || '테스트',
  templateName: '대신택배 출고',
  vars: { '품목': '테스트 현수막', '날짜': '2026-06-16' },
};

function loadDevVars() {
  const f = 'C:\\Users\\user\\dongsan_mes\\.dev.vars';
  const vars = {};
  if (fs.existsSync(f)) {
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return vars;
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
async function soap(base, service, method, inner) {
  const env = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body><${method} xmlns="http://ws.baroservice.com/">${inner}</${method}></soap:Body>
</soap:Envelope>`;
  const r = await fetch(`${base}/${service}.asmx`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': `http://ws.baroservice.com/${method}` },
    body: env,
  });
  return await r.text();
}
function extract(xml, tag) { const s = xml.indexOf(`<${tag}>`), e = xml.indexOf(`</${tag}>`); return (s >= 0 && e >= 0) ? xml.slice(s + tag.length + 2, e) : null; }
function fault(xml) { const m = xml.match(/<faultstring>(.*?)<\/faultstring>/s); return m ? m[1] : null; }
function unesc(s) { return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'); }

(async () => {
  const corpNum = String(process.argv[2] || '').replace(/-/g, '');
  const senderId = String(process.argv[3] || '');
  if (!corpNum) { console.error('✗ 사용법: node scripts/kakao-send-test.cjs <corpNum> <senderID> <수신번호> [수신자명]'); process.exit(1); }
  if (!CONFIG.to) { console.error('✗ 수신번호 필요: node scripts/kakao-send-test.cjs <corpNum> <senderID> <수신번호>'); process.exit(1); }

  const vars = loadDevVars();
  const certKey = vars.BAROBILL_CERT_KEY_PROD;
  const base = 'https://ws.baroservice.com';
  if (!certKey) { console.error('✗ BAROBILL_CERT_KEY_PROD 없음'); process.exit(1); }

  console.log(`[발송 준비] PROD corp=${corpNum} sender=${senderId || '(빈값)'} → ${CONFIG.to}`);

  // 1) 채널 조회
  const chXml = await soap(base, 'KakaoTalk', 'GetKakaotalkChannels', `<CERTKEY>${esc(certKey)}</CERTKEY><CorpNum>${esc(corpNum)}</CorpNum>`);
  if (fault(chXml)) { console.error('✗ 채널조회 FAULT:', fault(chXml)); process.exit(2); }
  const channels = [];
  let m; const re = /<KakaotalkChannel>(.*?)<\/KakaotalkChannel>/gs;
  while ((m = re.exec(chXml))) channels.push(extract(m[1], 'ChannelId'));
  if (!channels.length) { console.error('✗ 채널 없음'); process.exit(2); }

  // 2) 템플릿 원문 확보 (CONFIG.templateName 매칭)
  let raw = null, usedChannel = null;
  for (const ch of channels) {
    if (!ch) continue;
    const tXml = await soap(base, 'KakaoTalk', 'GetKakaotalkTemplates', `<CERTKEY>${esc(certKey)}</CERTKEY><CorpNum>${esc(corpNum)}</CorpNum><ChannelId>${esc(ch)}</ChannelId>`);
    const tre = /<KakaotalkTemplate>(.*?)<\/KakaotalkTemplate>/gs; let tm;
    while ((tm = tre.exec(tXml))) {
      const b = tm[1];
      if (extract(b, 'TemplateName') === CONFIG.templateName) { raw = unesc(extract(b, 'TemplateContent') || ''); usedChannel = ch; }
    }
    if (raw != null) break;
  }
  if (raw == null) { console.error(`✗ 템플릿 "${CONFIG.templateName}" 미발견`); process.exit(3); }
  console.log(`[템플릿 원문] (채널 ${usedChannel})\n---\n${raw}\n---`);

  // 3) 변수 치환
  let msg = raw;
  for (const [k, v] of Object.entries(CONFIG.vars)) msg = msg.split('#{' + k + '}').join(v);
  const leftover = msg.match(/#\{[^}]+\}/g);
  if (leftover) { console.error('✗ 미치환 변수:', leftover.join(', '), '\n  → CONFIG.vars 보완 필요'); process.exit(4); }
  console.log(`[치환된 본문]\n---\n${msg}\n---`);

  // 4) 발송
  const body = `<CERTKEY>${esc(certKey)}</CERTKEY><CorpNum>${esc(corpNum)}</CorpNum><SenderID>${esc(senderId)}</SenderID><TemplateName>${esc(CONFIG.templateName)}</TemplateName><SendDT></SendDT><SmsReply>N</SmsReply><SmsSenderNum></SmsSenderNum><KakaotalkMessage><ReceiverName>${esc(CONFIG.receiverName)}</ReceiverName><ReceiverNum>${esc(CONFIG.to)}</ReceiverNum><Title></Title><Message>${esc(msg)}</Message><SmsMessage></SmsMessage></KakaotalkMessage>`;
  const sXml = await soap(base, 'KakaoTalk', 'SendATKakaotalk', body);
  const sf = fault(sXml);
  const res = extract(sXml, 'SendATKakaotalkResult');
  if (sf) { console.error('✗ 발송 FAULT:', sf); process.exit(5); }
  const num = Number((res || '').trim());
  if (Number.isFinite(num) && num < 0) {
    console.error(`✗ 발송 실패 — 바로빌 코드 ${res}`);
  } else {
    console.log(`✓ 발송 접수 성공 — SendKey/접수번호: ${res}`);
  }
  console.log('(raw)', sXml.replace(/\s+/g, ' ').slice(0, 400));
})().catch(e => { console.error('ERROR', e); process.exit(99); });
