// IA 자동 가공 테스트 페이지

var RULES = {
  scale: {
    "현수막": 5, "게시대": 5, "게릴라": 5, "솔벤현수막": 5,
    "패트": 1, "솔벤시트": 1, "합성지": 1, "포맥스": 1,
    "UV": 1, "클리어필름": 1, "간판": 1
  },
  margins: {
    "미싱": { w: 83, h: 0 },
    "사방접어미싱": { w: 61, h: 61 },
    "접어미싱": { w: 34, h: 0 },
    "봉미싱": { w: 0, h: 55 },
    "밴드미싱": { w: 2, h: 0 },
    "사방미싱": { w: 2, h: 0 },
    "열재단": { w: 14, h: 0 },
    "재단만": { w: 0, h: 0 },
    "재단": { w: 0, h: 0 },
    "사방큰펀칭": { w: 0, h: 0 },
    "라미네이팅": { w: 0, h: 0 },
    "양옆접어미싱+사방큰펀칭": { w: 34, h: 0 },
    "열재단+사방큰펀칭": { w: 14, h: 0 },
  },
  noChange: ["열재단", "재단만", "재단", "라미네이팅"]
};

function copyIaParams() {
  if (window._iaParamsJson) {
    navigator.clipboard.writeText(window._iaParamsJson).then(function() {
      showToast('ia_params.json 복사됨!\n\nIA PC에서:\n' + window._iaWatchDir + '\\' + window._iaJobName + '\\ia_params.json\n에 붙여넣기', 'success');
    });
  }
}

function toggleCustomFinishing() {
  var sel = document.getElementById('inputFinishing');
  var cust = document.getElementById('inputFinishingCustom');
  if (cust.classList.contains('hidden')) {
    cust.classList.remove('hidden');
    sel.classList.add('hidden');
  } else {
    cust.classList.add('hidden');
    sel.classList.remove('hidden');
  }
}

document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('useClipBounds').addEventListener('change', function() {
    document.getElementById('clipFields').classList.toggle('hidden', !this.checked);
  });
});

function getInputs() {
  var finishing = document.getElementById('inputFinishing').classList.contains('hidden')
    ? document.getElementById('inputFinishingCustom').value.trim()
    : document.getElementById('inputFinishing').value;

  return {
    source: document.getElementById('inputSource').value.trim(),
    product: document.getElementById('inputProduct').value,
    width: parseFloat(document.getElementById('inputWidth').value) || 0,
    height: parseFloat(document.getElementById('inputHeight').value) || 0,
    finishing: finishing,
    useClip: document.getElementById('useClipBounds').checked,
    clipLeft: parseFloat(document.getElementById('clipLeft').value) || 0,
    clipTop: parseFloat(document.getElementById('clipTop').value) || 0,
    clipRight: parseFloat(document.getElementById('clipRight').value) || 0,
    clipBottom: parseFloat(document.getElementById('clipBottom').value) || 0,
  };
}

function determineProduct(inp) {
  if (inp.product) return { product: inp.product, method: "수동 선택" };
  // 품목 없으면 기본 현수막
  return { product: "현수막", method: "기본값 (품목 미지정)" };
}

function determineScale(product, widthCm) {
  var base = RULES.scale[product] || 5;
  if (product === "현수막" || product === "게시대" || product === "솔벤현수막") {
    if (widthCm > 300) return 5;
    if (widthCm > 150) return 2;
    return base;
  }
  return base;
}

function determineMargins(finishing) {
  if (!finishing) return { w: 0, h: 0 };
  if (RULES.margins[finishing]) return RULES.margins[finishing];
  // 키워드 매칭
  var keys = Object.keys(RULES.margins).sort(function(a,b) { return b.length - a.length; });
  for (var i = 0; i < keys.length; i++) {
    if (finishing.indexOf(keys[i]) !== -1) return RULES.margins[keys[i]];
  }
  return { w: 0, h: 0 };
}

function runPreview() {
  var inp = getInputs();
  if (!inp.width || !inp.height) {
    showToast('규격을 입력하세요', 'warning');
    return;
  }

  var det = determineProduct(inp);
  var scale = determineScale(det.product, inp.width);
  var margins = determineMargins(inp.finishing);
  var isNoChange = RULES.noChange.indexOf(inp.finishing) !== -1;

  // 실제 출력 크기 계산
  var designW = inp.width * 10; // cm → mm
  var designH = inp.height * 10;
  var fileW = designW / scale; // 파일 내 크기 (축소 적용)
  var fileH = designH / scale;
  var marginW = margins.w / scale; // 파일 내 여백
  var marginH = margins.h / scale;
  var outputW = fileW + marginW * 2;
  var outputH = fileH + marginH * 2;

  // 교차검증 플래그
  var flags = [];
  if (!inp.product && scale === 1) {
    flags.push("품목 미지정 + 비율 1:1 → 현수막이 아닐 수 있음");
  }

  var html = '';
  html += row("품목", det.product + ' <span class="text-gray-400">(' + det.method + ')</span>');
  html += row("축소비율", '1:' + scale);
  html += row("실제 규격", designW + ' x ' + designH + 'mm');
  html += row("파일 내 크기", fileW.toFixed(1) + ' x ' + fileH.toFixed(1) + 'mm');
  html += row("후가공", inp.finishing || '없음');
  html += row("여백 (좌우/상하)", margins.w + 'mm / ' + margins.h + 'mm');
  html += row("파일 내 여백", marginW.toFixed(1) + 'mm / ' + marginH.toFixed(1) + 'mm');
  html += row("최종 출력 크기", outputW.toFixed(1) + ' x ' + outputH.toFixed(1) + 'mm (파일)');
  html += row("파일 가공", isNoChange
    ? '<span class="text-gray-400">무가공 (디자인 변화 없음)</span>'
    : '<span class="text-green-600">여백 + 재단선 추가</span>');

  if (inp.useClip) {
    html += row("클리핑 좌표", inp.clipLeft + ', ' + inp.clipTop + ' ~ ' + inp.clipRight + ', ' + inp.clipBottom + ' mm');
  }

  if (flags.length > 0) {
    html += '<div class="col-span-2 bg-amber-50 border border-amber-200 rounded p-2 mt-2">';
    html += '<span class="text-amber-700 text-xs font-medium">[!] 경고</span><ul class="text-xs text-amber-600 mt-1">';
    for (var i = 0; i < flags.length; i++) {
      html += '<li>' + flags[i] + '</li>';
    }
    html += '</ul></div>';
  }

  document.getElementById('rulePreview').innerHTML = html;
  document.getElementById('previewSection').classList.remove('hidden');
  document.getElementById('btnProcess').disabled = false;
}

function row(label, value) {
  return '<div class="text-gray-500">' + label + '</div><div class="font-medium">' + value + '</div>';
}

function runProcess() {
  var inp = getInputs();
  if (!inp.source) {
    showToast('원본 파일 경로를 입력하세요', 'warning');
    return;
  }
  if (!inp.width || !inp.height) {
    showToast('규격을 입력하세요', 'warning');
    return;
  }

  var det = determineProduct(inp);
  var scale = determineScale(det.product, inp.width);
  var margins = determineMargins(inp.finishing);

  var params = {
    source: inp.source,
    product: det.product,
    width: inp.width,
    height: inp.height,
    finishing: inp.finishing,
    scale: scale,
    marginW: margins.w,
    marginH: margins.h,
  };

  if (inp.useClip) {
    params.clipBounds = {
      left: inp.clipLeft,
      top: inp.clipTop,
      right: inp.clipRight,
      bottom: inp.clipBottom,
    };
  }

  document.getElementById('statusMsg').textContent = '가공 요청 중...';
  document.getElementById('btnProcess').disabled = true;

  // API 호출 — 규칙 계산 + ia_params.json 생성
  axios.post('/api/ia-auto/process', params)
    .then(function(res) {
      var d = res.data;
      document.getElementById('statusMsg').textContent = '';
      document.getElementById('resultSection').classList.remove('hidden');

      if (d.success) {
        var iaJson = JSON.stringify(d.iaParams, null, 2);
        var html = '<div class="space-y-3">';

        // 규칙 요약
        html += '<div class="bg-blue-50 border border-blue-200 rounded p-3">';
        html += '<div class="text-blue-700 font-medium text-sm mb-2">적용 규칙</div>';
        html += '<div class="text-xs text-gray-600 grid grid-cols-2 gap-1">';
        html += '<div>품목: ' + d.rules.product + '</div>';
        html += '<div>축소: 1:' + d.rules.scale + '</div>';
        html += '<div>여백: 좌우 ' + d.rules.margins.w + 'mm, 상하 ' + d.rules.margins.h + 'mm</div>';
        html += '<div>출력: ' + d.outputs.eps.split('\\\\').pop() + '</div>';
        html += '</div></div>';

        // ia_params.json
        html += '<div class="bg-gray-50 border rounded p-3">';
        html += '<div class="flex items-center justify-between mb-2">';
        html += '<span class="text-xs font-medium text-gray-600">ia_params.json</span>';
        html += '<button onclick="copyIaParams()" class="px-2 py-1 text-[10px] bg-gray-200 rounded hover:bg-gray-300">복사</button>';
        html += '</div>';
        html += '<pre id="iaParamsJson" class="text-[10px] text-gray-700 overflow-auto max-h-[200px] bg-white rounded p-2 border">' + iaJson.replace(/</g,'&lt;') + '</pre>';
        html += '</div>';

        // 실행 안내
        html += '<div class="bg-amber-50 border border-amber-200 rounded p-3">';
        html += '<div class="text-amber-700 text-xs">';
        html += '<div class="font-medium mb-1">실행 방법 (IA PC에서):</div>';
        html += '<div>1. 위 JSON을 <code>Z:\\Designs\\IllustratorAutomat\\test-watch\\' + d.jobName + '\\ia_params.json</code>에 저장</div>';
        html += '<div>2. IllustratorAutomat이 자동 감지하여 가공 실행</div>';
        html += '<div>3. 완료 후 <code>' + d.outputs.eps.split('\\\\').pop() + '</code> 확인</div>';
        html += '</div></div>';

        html += '</div>';
        document.getElementById('resultContent').innerHTML = html;

        // 전역 변수에 저장 (복사용)
        window._iaParamsJson = iaJson;
        window._iaJobName = d.jobName;
        window._iaWatchDir = d.watchDir;
      } else {
        document.getElementById('resultContent').innerHTML =
          '<div class="bg-red-50 border border-red-200 rounded p-3">' +
          '<div class="text-red-700 font-medium text-sm">[X] ' + (d.error || '오류') + '</div>' +
          '</div>';
      }
      document.getElementById('btnProcess').disabled = false;
    })
    .catch(function(err) {
      document.getElementById('statusMsg').textContent = '';
      document.getElementById('resultSection').classList.remove('hidden');
      document.getElementById('resultContent').innerHTML =
        '<div class="bg-red-50 border border-red-200 rounded p-3">' +
        '<div class="text-red-700 font-medium text-sm">[X] ' + (err.response ? err.response.data.error : err.message) + '</div>' +
        '</div>';
      document.getElementById('btnProcess').disabled = false;
    });
}
