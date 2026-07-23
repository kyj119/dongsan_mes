/**
 * MES A0 CEP panel PoC — main.js
 * Roster dropdown + localStorage persistence + two test buttons wired to jsx/host.jsx.
 */
(function () {
  'use strict';

  var ROSTER = ['인호동', '김보연', '정소은', '김영주'];
  var STORAGE_KEY = 'mes_a0_worker';

  document.addEventListener('DOMContentLoaded', function () {
    var csInterface = new CSInterface();

    var workerSelect = document.getElementById('worker');
    var savedLabel = document.getElementById('saved');
    var btnProcess = document.getElementById('btnProcess');
    var btnSheet = document.getElementById('btnSheet');
    var outEl = document.getElementById('out');

    if (!workerSelect) { console.warn('[mes-a0-cep] #worker not found'); return; }
    if (!savedLabel) { console.warn('[mes-a0-cep] #saved not found'); }
    if (!btnProcess) { console.warn('[mes-a0-cep] #btnProcess not found'); }
    if (!btnSheet) { console.warn('[mes-a0-cep] #btnSheet not found'); }
    if (!outEl) { console.warn('[mes-a0-cep] #out not found'); }

    // populate roster
    for (var i = 0; i < ROSTER.length; i++) {
      var opt = document.createElement('option');
      opt.value = ROSTER[i];
      opt.textContent = ROSTER[i];
      workerSelect.appendChild(opt);
    }

    function updateSavedLabel(name) {
      if (!savedLabel) return;
      savedLabel.textContent = '저장됨: ' + (name || '(없음)');
    }

    // restore persisted selection
    var stored = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      console.warn('[mes-a0-cep] localStorage read failed', e);
    }
    if (stored && ROSTER.indexOf(stored) !== -1) {
      workerSelect.value = stored;
      updateSavedLabel(stored);
    } else {
      updateSavedLabel(workerSelect.value);
    }

    workerSelect.addEventListener('change', function () {
      var name = workerSelect.value;
      try {
        window.localStorage.setItem(STORAGE_KEY, name);
      } catch (e) {
        console.warn('[mes-a0-cep] localStorage write failed', e);
      }
      updateSavedLabel(name);
    });

    function writeOut(text) {
      if (!outEl) return;
      outEl.textContent = text;
    }

    if (btnProcess) {
      btnProcess.addEventListener('click', function () {
        var selected = workerSelect.value;
        csInterface.evalScript('mesA0_getDocInfo()', function (result) {
          writeOut('process OK\nworker=' + selected + '\ndoc=' + result);
        });
      });
    }

    if (btnSheet) {
      btnSheet.addEventListener('click', function () {
        writeOut('sheet OK');
      });
    }
  });
})();
