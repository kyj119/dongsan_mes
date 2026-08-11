// 품목 통합 도구 — 통합쌍 CSV(버릴코드,남길코드)를 받아 참조 재연결 + 삭제 + 롤백 SQL 생성
// 사용: node mergetool.cjs <pairs.csv>
const fs=require('fs'), {execFileSync}=require('child_process')
const REFS=[['purchase_order_items','item_id'],['order_items','item_id'],['order_items','parent_item_id'],
 ['product_materials','material_item_id'],['product_materials','product_item_id'],['bom_items','item_id'],['bom_items','material_item_id'],
 ['inventory','item_id'],['inventory_transactions','item_id'],['client_item_prices','item_id'],['quotation_items','item_id'],
 ['purchase_request_items','item_id'],['po_template_items','item_id'],['price_policy_rules','item_id'],['price_sheet_items','item_id'],
 ['size_grade_prices','item_id'],['item_post_processing_defaults','item_id'],['purchase_invoice_items','item_id'],
 ['inventory_count_items','item_id'],['inventory_adjustments','item_id'],['inventory_receipt_items','item_id'],
 ['inventory_release_items','item_id'],['inventory_fifo_layers','item_id'],['stock_alerts','item_id'],
 ['mrp_results','material_item_id'],['cost_snapshots','material_item_id'],['waste_records','material_item_id'],
 ['inventory_auto_deductions','material_item_id'],['pp_material_deductions','material_item_id']]
const pairs=fs.readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/).slice(1)
  .map(l=>l.split(',').map(s=>s.trim())).filter(p=>p[0]&&p[1])
const q=s=>"'"+String(s).replace(/'/g,"''")+"'"
const L=[`-- 품목 통합 일괄 — ${pairs.length}쌍 (생성 ${new Date? '':''}2026-08-11)
-- 각 쌍마다 item 참조 ${REFS.length}개 컬럼을 전부 재연결한 뒤 버릴 품목을 삭제한다.
-- ⚠️ UNIQUE(product_item_id, material_item_id) 충돌 대비: product_materials 는 충돌 시 삭제.
-- 롤백 = rollback_merge_items_bulk.sql`]
for(const [drop,keep] of pairs){
  const D=`(SELECT id FROM items WHERE item_code=${q(drop)})`, K=`(SELECT id FROM items WHERE item_code=${q(keep)})`
  L.push(`-- ${drop} → ${keep}`)
  L.push(`DELETE FROM product_materials WHERE material_item_id=${D} AND product_item_id IN (SELECT product_item_id FROM product_materials WHERE material_item_id=${K});`)
  for(const [t,c] of REFS) L.push(`UPDATE ${t} SET ${c}=${K} WHERE ${c}=${D};`)
  L.push(`DELETE FROM items WHERE item_code=${q(drop)};`)
}
fs.writeFileSync('C:/Users/user/dongsan_mes/docs/dongsan-import/load/merge_items_bulk.sql', L.join('\n')+'\n','utf8')
console.log('쌍',pairs.length,'· 문장',L.length-1)
