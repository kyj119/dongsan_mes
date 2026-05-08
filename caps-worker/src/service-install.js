// caps-worker/src/service-install.js
// Windows 서비스 등록 스크립트 (NSSM 또는 node-windows 사용)
//
// 사용법 (경리 PC의 caps-worker 폴더에서):
//   node src/service-install.js
//
// 또는 npm run install-service

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SERVICE_NAME = 'CapsWorker';
const WORKER_DIR = path.resolve(__dirname, '..');
const NODE_EXE = process.execPath; // 현재 Node.js 경로
const SCRIPT_PATH = path.join(WORKER_DIR, 'src', 'index.js');
const LOG_DIR = path.join(WORKER_DIR, 'logs');

// 로그 폴더 생성
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

console.log('========================================');
console.log('CAPS Worker 서비스 설치');
console.log('========================================');
console.log(`서비스명: ${SERVICE_NAME}`);
console.log(`Node.js:  ${NODE_EXE}`);
console.log(`스크립트: ${SCRIPT_PATH}`);
console.log(`작업 폴더: ${WORKER_DIR}`);
console.log('');

// 방법 1: sc.exe + srvany (복잡) → 건너뜀
// 방법 2: 작업 스케줄러 (안정적, 설치 불필요)

try {
  // 기존 작업 삭제 (있으면)
  try {
    execSync(`schtasks /Delete /TN "${SERVICE_NAME}" /F`, { stdio: 'pipe' });
    console.log('기존 예약 작업 삭제됨');
  } catch (e) {
    // 없으면 무시
  }

  // VBS 래퍼 생성 (창 없이 백그라운드 실행)
  const batPath = path.join(WORKER_DIR, 'start-service.bat');
  const batContent = [
    '@echo off',
    `cd /d "${WORKER_DIR}"`,
    `"${NODE_EXE}" "${SCRIPT_PATH}"`,
  ].join('\r\n');
  fs.writeFileSync(batPath, batContent);

  const vbsPath = path.join(WORKER_DIR, 'start-service.vbs');
  const vbsContent = `Set WshShell = CreateObject("WScript.Shell")\r\nWshShell.Run """${batPath}""", 0, False`;
  fs.writeFileSync(vbsPath, vbsContent);
  console.log(`배치 파일 생성: ${batPath}`);
  console.log(`VBS 래퍼 생성: ${vbsPath}`);

  // 작업 스케줄러에 등록 (VBS로 실행 → 창 없음)
  const cmd = `schtasks /Create /TN "${SERVICE_NAME}" /TR "wscript.exe \\"${vbsPath}\\"" /SC ONLOGON /RL HIGHEST /F`;
  execSync(cmd, { stdio: 'inherit' });

  console.log('');
  console.log('✅ 설치 완료!');
  console.log('');
  console.log('PC 로그인 시 자동으로 CAPS Worker가 시작됩니다.');
  console.log('');
  console.log('수동 실행:');
  console.log(`  schtasks /Run /TN "${SERVICE_NAME}"`);
  console.log('');
  console.log('상태 확인:');
  console.log(`  schtasks /Query /TN "${SERVICE_NAME}"`);
  console.log('');
  console.log('삭제:');
  console.log(`  npm run uninstall-service`);

} catch (err) {
  console.error('❌ 설치 실패:', err.message);
  console.log('');
  console.log('관리자 권한으로 실행해주세요:');
  console.log('  PowerShell을 관리자 모드로 열고 실행');
  process.exit(1);
}
