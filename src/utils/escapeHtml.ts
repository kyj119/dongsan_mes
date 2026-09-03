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

// 인라인 <script> 안에 JS 리터럴로 값을 넣을 때 쓴다.
// JSON.stringify 만으로는 문자열 안의 `</script>` 가 그대로 살아남아 스크립트 요소를 조기 종료시킨다.
// `<` 를 < 로 바꾸면 JS 값은 동일하면서 HTML 파서가 태그로 보지 않는다.
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value === undefined ? null : value).replace(/</g, '\\u003c')
}
