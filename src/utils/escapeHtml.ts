// 서버사이드 HTML 이스케이프 (#335)
// c.html() 로 렌더되는 템플릿 리터럴에 DB/사용자 입력을 삽입할 때 stored XSS 방지.
// 클라이언트 window.escapeHtml(layout.ts)과 동일 규칙.
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
