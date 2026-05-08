// UI Guide - 패널 토글
function togglePanel(name) {
  var panel = document.getElementById('pan-' + name);
  var icon = document.getElementById('ico-' + name);
  if (!panel) return;
  var hidden = panel.classList.contains('hidden');
  panel.classList.toggle('hidden');
  if (icon) {
    icon.classList.toggle('fa-chevron-down', hidden);
    icon.classList.toggle('fa-chevron-up', !hidden);
  }
}

function toggleSection(mode) {
  var sections = ['colors', 'buttons', 'cards', 'badges', 'filters', 'tables', 'forms', 'icons', 'spacing'];
  sections.forEach(function(name) {
    var panel = document.getElementById('pan-' + name);
    var icon = document.getElementById('ico-' + name);
    if (!panel) return;
    if (mode === 'all') {
      panel.classList.remove('hidden');
      if (icon) { icon.classList.add('fa-chevron-up'); icon.classList.remove('fa-chevron-down'); }
    } else {
      panel.classList.add('hidden');
      if (icon) { icon.classList.add('fa-chevron-down'); icon.classList.remove('fa-chevron-up'); }
    }
  });
}
