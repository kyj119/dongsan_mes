/**
 * PNG 왕복 — 호스트가 구운 PNG 를 읽고, 만든 픽셀을 다시 PNG 로 쓴다.
 *
 * ★**재단과 전사가 같은 코드를 쓴다.** 도련 엔진(`bleed.js`)은 이미 공유인데 입출구가 사본이면
 *   한쪽에서 고친 것이 다른 쪽에 안 온다 — 이 저장소가 형제 스윕으로 여러 번 겪은 형태다
 *   (work.ai 폐지 · embedAllFonts · 잉크 경계가 전부 「한 호스트만 고쳐졌다」로 시작했다).
 *
 * ⚠️ `readPng` 의 try 는 `getImageData` **만** 감싼다 — 콜백까지 감싸면 콜백 안의 예외가
 *    "canvas 읽기 실패(보안)" 으로 둔갑해 전혀 다른 곳을 가리킨다(2026-08-06 실측).
 */
(function (root) {
  'use strict';

  function b64enc() {
    return (root.cep && root.cep.encoding && root.cep.encoding.Base64) ? root.cep.encoding.Base64 : 'Base64';
  }

  /** 파일을 읽어 `{W,H,ch,data}` 로 — `cep.fs` 가 막히면 `file://` 로 폴백한다. */
  function readPng(path, cb) {
    var b64 = null;
    try {
      var r = root.cep.fs.readFile(path, b64enc());
      if (r && r.err === 0) b64 = r.data;
    } catch (e) { /* ignore: cep.fs 실패는 아래 file:// 폴백이 받는다 */ }
    var img = new Image();
    img.onload = function () {
      var cv = document.createElement('canvas');
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      var ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0);
      var d = null;
      try {
        d = ctx.getImageData(0, 0, cv.width, cv.height);
      } catch (eTaint) { cb('canvas 읽기 실패(보안): ' + eTaint, null); return; }
      cb(null, { W: cv.width, H: cv.height, ch: 4, data: d.data });
    };
    img.onerror = function () { cb('PNG 로드 실패: ' + path, null); };
    img.src = b64 ? ('data:image/png;base64,' + b64) : ('file:///' + String(path).replace(/\\/g, '/'));
  }

  /** `{W,H,data}` 를 그 경로에 PNG 로 쓴다. @return 성공 여부 */
  function writePng(path, r) {
    try {
      var cv = document.createElement('canvas');
      cv.width = r.W; cv.height = r.H;
      var ctx = cv.getContext('2d');
      var im = ctx.createImageData(r.W, r.H);
      im.data.set(r.data);
      ctx.putImageData(im, 0, 0);
      var b64 = cv.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
      var w = root.cep.fs.writeFile(path, b64, b64enc());
      return !!(w && w.err === 0);
    } catch (e) { return false; }
  }

  root.MesPngIo = { readPng: readPng, writePng: writePng };
})(typeof window !== 'undefined' ? window : globalThis);
