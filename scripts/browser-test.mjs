import { chromium } from 'playwright';

const BASE = 'http://192.168.0.94:3000';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push('PAGE_ERROR: ' + err.message));

  // 1. Login
  console.log('=== 1. 로그인 ===');
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.fill('#username', 'admin');
  await page.fill('#password', 'password');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  console.log('  URL:', page.url());

  // 2. Items page
  console.log('\n=== 2. 품목 관리 페이지 ===');
  errors.length = 0;
  await page.goto(BASE + '/items', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  console.log('  콘솔 에러:', errors.length, '건');
  errors.forEach(e => console.log('    ERROR:', e.substring(0, 200)));

  // 3. Check window functions
  console.log('\n=== 3. 전역 함수 확인 ===');
  const funcs = await page.evaluate(() => ({
    editItem: typeof window.editItem,
    showCreateModalForTab: typeof window.showCreateModalForTab,
    deleteItem: typeof window.deleteItem,
    showGroupPriceModal: typeof window.showGroupPriceModal,
    showCreateModal: typeof window.showCreateModal,
    switchMainTab: typeof window.switchMainTab,
  }));
  Object.entries(funcs).forEach(([k,v]) => console.log('  ' + k + ': ' + v));

  // 4. Tab switching
  console.log('\n=== 4. 탭 전환 ===');
  for (const tab of ['rawMaterial', 'transfer', 'settings', 'output']) {
    try {
      await page.click('#tabBtn' + tab.charAt(0).toUpperCase() + tab.slice(1));
      await page.waitForTimeout(1500);
      console.log('  ' + tab + ': OK');
    } catch(e) {
      console.log('  ' + tab + ': FAIL - ' + e.message.substring(0, 80));
    }
  }

  // 5. Raw material tab - find edit buttons
  console.log('\n=== 5. 원자재 탭 수정 버튼 ===');
  await page.click('#tabBtnRawMaterial');
  await page.waitForTimeout(2000);

  const rmContent = await page.textContent('#rmItemsList');
  console.log('  원자재 목록 내용 길이:', (rmContent || '').length);

  const editButtons = await page.$$eval('#rmItemsList button', btns =>
    btns.filter(b => b.textContent.includes('수정')).map(b => b.getAttribute('onclick') || 'no-onclick')
  );
  console.log('  수정 버튼:', editButtons.length, '개');
  if (editButtons.length > 0) console.log('  첫 번째 onclick:', editButtons[0]);

  // Try clicking first edit button
  if (editButtons.length > 0) {
    try {
      await page.click('#rmItemsList button:has-text("수정")');
      await page.waitForTimeout(2000);
      const modalOpen = await page.evaluate(() => {
        const m = document.getElementById('itemModal');
        return m ? !m.classList.contains('hidden') : false;
      });
      console.log('  수정 모달 열림:', modalOpen);
    } catch(e) {
      console.log('  수정 클릭 에러:', e.message.substring(0, 100));
    }
  }

  // 6. Settings tab - group price button
  console.log('\n=== 6. 설정 탭 단가조정 버튼 ===');
  await page.click('#tabBtnSettings');
  await page.waitForTimeout(2000);

  const priceButtons = await page.$$eval('button', btns =>
    btns.filter(b => b.textContent.includes('단가 조정')).length
  );
  console.log('  단가 조정 버튼:', priceButtons, '개');

  // 7. Create button on transfer tab
  console.log('\n=== 7. 전사 탭 추가 버튼 ===');
  await page.click('#tabBtnTransfer');
  await page.waitForTimeout(1500);

  try {
    await page.click('button:has-text("추가")');
    await page.waitForTimeout(1500);
    const createModalOpen = await page.evaluate(() => {
      const m = document.getElementById('itemModal');
      return m ? !m.classList.contains('hidden') : false;
    });
    console.log('  추가 모달 열림:', createModalOpen);
  } catch(e) {
    console.log('  추가 클릭 에러:', e.message.substring(0, 100));
  }

  // Final errors
  console.log('\n=== 최종 에러 ===');
  console.log('  총:', errors.length, '건');
  errors.slice(0, 10).forEach(e => console.log('  -', e.substring(0, 200)));

  await browser.close();
  console.log('\n완료');
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
