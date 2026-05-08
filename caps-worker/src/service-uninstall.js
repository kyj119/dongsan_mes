// caps-worker/src/service-uninstall.js
// Windows 예약 작업 제거
//
// 사용법: node src/service-uninstall.js
// 또는: npm run uninstall-service

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SERVICE_NAME = 'CapsWorker';
const WORKER_DIR = path.resolve(__dirname, '..');
const batPath = path.join(WORKER_DIR, 'start-service.bat');

console.log('========================================');
console.log('CAPS Worker 서비스 제거');
console.log('========================================');

try {
  // 실행 중인 작업 종료
  try {
    execSync(`schtasks /End /TN "${SERVICE_NAME}"`, { stdio: 'pipe' });
    console.log('실행 중인 작업 종료됨');
  } catch (e) {
    // 실행 중이 아니면 무시
  }

  // 예약 작업 삭제
  execSync(`schtasks /Delete /TN "${SERVICE_NAME}" /F`, { stdio: 'inherit' });
  console.log('예약 작업 삭제됨');

  // bat 파일 정리
  if (fs.existsSync(batPath)) {
    fs.unlinkSync(batPath);
    console.log('배치 파일 삭제됨');
  }

  console.log('');
  console.log('✅ 제거 완료!');

} catch (err) {
  console.error('❌ 제거 실패:', err.message);
  console.log('관리자 권한으로 실행해주세요.');
  process.exit(1);
}
