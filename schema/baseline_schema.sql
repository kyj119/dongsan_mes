PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE d1_migrations(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT NOT NULL CHECK(role IN ('ADMIN', 'MANAGER', 'DESIGNER', 'OPERATOR')) DEFAULT 'OPERATOR',
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
, default_entity_id INTEGER DEFAULT 1, is_coordinator INTEGER NOT NULL DEFAULT 0, job_role TEXT);
CREATE TABLE clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_code TEXT UNIQUE NOT NULL,          
  client_name TEXT NOT NULL,                 
  representative TEXT,                        
  business_type TEXT,                         
  business_item TEXT,                         
  phone TEXT,                                 
  mobile TEXT,                                
  fax TEXT,                                   
  email TEXT,                                 
  address TEXT,                               
  search_keywords TEXT,                       
  transfer_info TEXT,                         
  is_active INTEGER NOT NULL DEFAULT 1,      
  balance REAL DEFAULT 0,                     
  notes TEXT,                                 
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
, business_registration_number TEXT DEFAULT NULL, client_type TEXT DEFAULT 'SALES', purchase_balance REAL DEFAULT 0, price_list_id INTEGER DEFAULT NULL, invoice_method TEXT DEFAULT 'PER_ORDER', overdue_alert_days INTEGER DEFAULT 30, opening_balance REAL DEFAULT 0, credit_limit REAL DEFAULT 0, credit_hold INTEGER DEFAULT 0, billing_group_id INTEGER REFERENCES billing_groups(id), payment_terms_days INTEGER DEFAULT 30, payment_method TEXT, postal_code TEXT, address_detail TEXT, delivery_method TEXT DEFAULT 'SAME', delivery_address TEXT, auto_billing INTEGER DEFAULT 0, price_policy_id INTEGER REFERENCES price_policies(id), credit_risk_score REAL DEFAULT 0, credit_risk_grade TEXT DEFAULT 'N/A', credit_risk_updated_at DATETIME, payment_cycle_type TEXT NOT NULL DEFAULT 'NET_DAYS', closing_day INTEGER, payment_month_offset INTEGER DEFAULT 1, payment_day INTEGER, settlement_threshold REAL DEFAULT 0);
CREATE TABLE item_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_name TEXT UNIQUE NOT NULL,        
  category_code TEXT UNIQUE NOT NULL,        
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE item_subcategories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  subcategory_name TEXT NOT NULL,
  subcategory_code TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES item_categories(id) ON DELETE CASCADE,
  UNIQUE(category_id, subcategory_code)
);
CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  subcategory_id INTEGER,
  item_code TEXT UNIQUE NOT NULL,
  item_name TEXT NOT NULL,
  description TEXT,
  unit TEXT DEFAULT 'EA',                    
  base_price REAL DEFAULT 0,                 
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, category TEXT, sub_category TEXT, is_sales_item INTEGER DEFAULT 0, is_purchase_item INTEGER DEFAULT 0, pricing_method TEXT DEFAULT 'FIXED' CHECK(pricing_method IN ('FIXED', 'AREA')), width_mm INTEGER, item_group TEXT, group_sort INTEGER DEFAULT 0, item_type TEXT DEFAULT 'PRODUCT'
  CHECK(item_type IN ('PRODUCT', 'GOODS', 'MATERIAL')), storage_zone_id INTEGER REFERENCES storage_zones(id) ON DELETE SET NULL, print_method_id INTEGER REFERENCES print_methods(id), print_media_id INTEGER REFERENCES print_media(id), parent_media_id INTEGER REFERENCES print_media(id), code_prefix TEXT, specification TEXT, sales_price REAL DEFAULT 0, is_favorite INTEGER DEFAULT 0, avg_unit_cost REAL DEFAULT 0, price_group_id INTEGER REFERENCES price_groups(id), production_required INTEGER NOT NULL DEFAULT 1, pricing_profile TEXT
  CHECK(pricing_profile IN ('FIXED', 'AREA', 'GRADE', 'COMPONENT')), spec_group_id INTEGER REFERENCES spec_groups(id), spec_value TEXT, ecount_code TEXT, spec_group_id2 INTEGER REFERENCES spec_groups(id), spec_value2 TEXT, deduction_method TEXT DEFAULT 'ROLL', sheet_spec TEXT, waste_factor REAL DEFAULT 1.0, base_unit TEXT, pack_size REAL, stock_mode TEXT DEFAULT 'CONTINUOUS', image_key TEXT, search_keywords TEXT,
  FOREIGN KEY (category_id) REFERENCES item_categories(id) ON DELETE RESTRICT,
  FOREIGN KEY (subcategory_id) REFERENCES item_subcategories(id) ON DELETE SET NULL
);
CREATE TABLE post_processing_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  option_code TEXT UNIQUE NOT NULL,          
  option_name TEXT NOT NULL,                 
  margin_left REAL DEFAULT 0,                
  margin_right REAL DEFAULT 0,               
  margin_top REAL DEFAULT 0,                 
  margin_bottom REAL DEFAULT 0,              
  additional_cost REAL DEFAULT 0,            
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
, parameter_schema TEXT, pricing_type TEXT DEFAULT 'fixed', unit_price REAL DEFAULT 0, pp_category TEXT DEFAULT 'finish', display_on_card INTEGER DEFAULT 1, material_item_group TEXT);
CREATE TABLE settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT,
  description TEXT,
  updated_by INTEGER,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  payment_date DATE NOT NULL,                 
  amount REAL NOT NULL,                       
  payment_method TEXT,                        
  reference_number TEXT,                      
  notes TEXT,                                 
  created_by INTEGER,                         
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1, tax_invoice_id INTEGER,
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE TABLE inventory_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_number TEXT UNIQUE NOT NULL,                
  receipt_date DATE NOT NULL,                         
  supplier TEXT NOT NULL,                             
  total_amount REAL DEFAULT 0,                        
  status TEXT NOT NULL DEFAULT 'COMPLETED',           
  received_by INTEGER,                                
  notes TEXT,                                         
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, po_id INTEGER DEFAULT NULL, supplier_id INTEGER DEFAULT NULL, inspection_status TEXT, entity_id INTEGER DEFAULT 1 REFERENCES entities(id), statement_file_key TEXT,
  FOREIGN KEY (received_by) REFERENCES users(id)
);
CREATE TABLE inventory_releases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  release_number TEXT UNIQUE NOT NULL,                
  release_date DATE NOT NULL,                         
  reference_type TEXT NOT NULL,                       
  reference_id INTEGER,                               
  status TEXT NOT NULL DEFAULT 'COMPLETED',           
  released_by INTEGER,                                
  notes TEXT,                                         
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1 REFERENCES entities(id),
  FOREIGN KEY (released_by) REFERENCES users(id)
);
CREATE TABLE employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_code TEXT UNIQUE NOT NULL,               
  user_id INTEGER,                                  
  name TEXT NOT NULL,                                
  name_eng TEXT,                                     
  resident_number TEXT,                              
  email TEXT,                                        
  phone TEXT,                                        
  mobile TEXT,                                       
  address TEXT,                                      
  
  department TEXT NOT NULL,                          
  position TEXT NOT NULL,                            
  job_title TEXT,                                    
  employment_type TEXT NOT NULL DEFAULT 'FULL_TIME', 
  
  hire_date DATE NOT NULL,                           
  resignation_date DATE,                             
  status TEXT NOT NULL DEFAULT 'ACTIVE',             
  
  base_salary INTEGER DEFAULT 0,                     
  hourly_rate INTEGER DEFAULT 0,                     
  
  bank_name TEXT,                                    
  bank_account TEXT,                                 
  
  emergency_contact TEXT,                            
  emergency_phone TEXT,                              
  
  notes TEXT,                                        
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, dependents_count INTEGER DEFAULT 0, children_under_20_count INTEGER DEFAULT 0, income_tax_table_option TEXT DEFAULT '100', insurance_grade TEXT, caps_employee_code TEXT, caps_sync_enabled INTEGER DEFAULT 1, birth_date DATE, bank_holder TEXT, position_allowance INTEGER DEFAULT 0, vehicle_allowance INTEGER DEFAULT 0, meal_allowance_fixed INTEGER DEFAULT 0, special_bonus_fixed INTEGER DEFAULT 0, other_allowance_fixed INTEGER DEFAULT 0, mutual_aid_fee INTEGER DEFAULT 0, other_deduction_fixed INTEGER DEFAULT 0, insurance_apply_national_pension INTEGER DEFAULT 1, insurance_apply_health INTEGER DEFAULT 1, insurance_apply_long_term_care INTEGER DEFAULT 1, insurance_apply_employment INTEGER DEFAULT 1, insurance_apply_industrial_accident INTEGER DEFAULT 1, caps_last_synced_at DATETIME, caps_id TEXT, pay_type TEXT NOT NULL DEFAULT 'VARIABLE', postal_code TEXT, address_detail TEXT, entity_id INTEGER DEFAULT 1, overtime_daily_hours REAL DEFAULT 0, overtime_work_days INTEGER DEFAULT 22, caps_site_id TEXT DEFAULT NULL, is_deleted INTEGER NOT NULL DEFAULT 0, deleted_at DATETIME DEFAULT NULL, deleted_by INTEGER DEFAULT NULL, department_id INTEGER REFERENCES departments(id), pension_base INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,                      
  work_date DATE NOT NULL,                           
  check_in_time DATETIME,                            
  check_out_time DATETIME,                           
  work_hours REAL DEFAULT 0,                         
  overtime_hours REAL DEFAULT 0,                     
  
  attendance_type TEXT NOT NULL DEFAULT 'NORMAL',    
  status TEXT NOT NULL DEFAULT 'PRESENT',            
  
  notes TEXT,                                        
  approved_by INTEGER,                               
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, source TEXT DEFAULT 'MANUAL', caps_fpid INTEGER, caps_e_idno TEXT, caps_late_min INTEGER DEFAULT 0, caps_early_min INTEGER DEFAULT 0, caps_over_min INTEGER DEFAULT 0, caps_night_min INTEGER DEFAULT 0, caps_total_min INTEGER DEFAULT 0, caps_raw_json TEXT, caps_synced_at DATETIME, early_hours REAL DEFAULT 0, early_leave_hours REAL DEFAULT 0, holiday_work_hours REAL DEFAULT 0, late_minutes INTEGER DEFAULT 0, caps_site_id TEXT DEFAULT NULL, entity_id INTEGER DEFAULT 1,
  
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (approved_by) REFERENCES users(id),
  UNIQUE(employee_id, work_date)                     
);
CREATE TABLE leave_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,                      
  leave_type TEXT NOT NULL,                          
  start_date DATE NOT NULL,                          
  end_date DATE NOT NULL,                            
  days REAL NOT NULL,                                
  reason TEXT,                                       
  status TEXT NOT NULL DEFAULT 'PENDING',            
  approved_by INTEGER,                               
  approved_at DATETIME,                              
  rejection_reason TEXT,                             
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, created_by INTEGER REFERENCES users(id), entity_id INTEGER DEFAULT 1,
  
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (approved_by) REFERENCES users(id)
);
CREATE TABLE payroll (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,                      
  pay_period TEXT NOT NULL,                          
  pay_date DATE NOT NULL,                            
  
  base_salary INTEGER NOT NULL DEFAULT 0,            
  overtime_pay INTEGER DEFAULT 0,                    
  night_pay INTEGER DEFAULT 0,                       
  holiday_pay INTEGER DEFAULT 0,                     
  meal_allowance INTEGER DEFAULT 0,                  
  transportation_allowance INTEGER DEFAULT 0,        
  other_allowance INTEGER DEFAULT 0,                 
  
  total_salary INTEGER NOT NULL DEFAULT 0,           
  
  national_pension INTEGER DEFAULT 0,                
  health_insurance INTEGER DEFAULT 0,                
  employment_insurance INTEGER DEFAULT 0,            
  income_tax INTEGER DEFAULT 0,                      
  local_tax INTEGER DEFAULT 0,                       
  other_deduction INTEGER DEFAULT 0,                 
  
  total_deduction INTEGER NOT NULL DEFAULT 0,        
  net_pay INTEGER NOT NULL DEFAULT 0,                
  
  work_days REAL DEFAULT 0,                          
  overtime_hours REAL DEFAULT 0,                     
  
  status TEXT NOT NULL DEFAULT 'PENDING',            
  paid_at DATETIME,                                  
  
  notes TEXT,                                        
  created_by INTEGER,                                
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, long_term_care_insurance INTEGER DEFAULT 0, annual_leave_pay INTEGER DEFAULT 0, bonus INTEGER DEFAULT 0, nontax_meal INTEGER DEFAULT 0, nontax_transport INTEGER DEFAULT 0, nontax_childcare INTEGER DEFAULT 0, taxable_pay INTEGER DEFAULT 0, employer_national_pension INTEGER DEFAULT 0, employer_health_insurance INTEGER DEFAULT 0, employer_long_term_care INTEGER DEFAULT 0, employer_employment_insurance INTEGER DEFAULT 0, employer_industrial_accident INTEGER DEFAULT 0, absent_days REAL DEFAULT 0, late_count INTEGER DEFAULT 0, leave_used_days REAL DEFAULT 0, attendance_synced_at DATETIME, approved_by INTEGER, approved_at DATETIME, entity_id INTEGER DEFAULT 1, extra_overtime_hours REAL DEFAULT 0, published_at TEXT,
  
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE(employee_id, pay_period)                    
);
CREATE TABLE production_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  log_date DATE NOT NULL,                    
  shift TEXT NOT NULL DEFAULT 'DAY',         
  weather TEXT,                              
  temperature INTEGER,                       
  humidity INTEGER,                          
  supervisor_id INTEGER,                     
  notes TEXT,                                
  created_by INTEGER NOT NULL,               
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1,
  FOREIGN KEY (supervisor_id) REFERENCES employees(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE(log_date, shift)                    
);
CREATE TABLE work_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  production_log_id INTEGER NOT NULL,        
  card_id INTEGER NOT NULL,                  
  employee_id INTEGER NOT NULL,              
  work_type TEXT NOT NULL,                   
  start_time DATETIME NOT NULL,              
  end_time DATETIME,                         
  work_hours REAL,                           
  quantity_completed INTEGER DEFAULT 0,      
  quantity_target INTEGER,                   
  status TEXT DEFAULT 'IN_PROGRESS',         
  notes TEXT,                                
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1,
  FOREIGN KEY (production_log_id) REFERENCES production_logs(id) ON DELETE CASCADE,
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);
CREATE TABLE ai_analysis_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  
  groups_json TEXT,    
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
, file_content TEXT, retry_count INTEGER NOT NULL DEFAULT 0, max_retries INTEGER NOT NULL DEFAULT 3, last_error_at DATETIME, entity_id INTEGER DEFAULT 1, canvas_json TEXT);
CREATE TABLE ai_file_chunks (
  analysis_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_data TEXT NOT NULL,
  PRIMARY KEY (analysis_id, chunk_index)
);
CREATE TABLE item_post_processing_defaults (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  pp_option_id INTEGER NOT NULL,
  default_params TEXT,                        
  is_enabled_by_default INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(item_id, pp_option_id),
  FOREIGN KEY (item_id) REFERENCES items(id),
  FOREIGN KEY (pp_option_id) REFERENCES post_processing_options(id)
);
CREATE TABLE pp_applicable_subcategories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_name TEXT NOT NULL,    
  subcat_name TEXT NOT NULL,   
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  UNIQUE(group_name, subcat_name)
);
CREATE TABLE pp_option_subcategories (
  pp_option_id INTEGER NOT NULL,
  subcat_id INTEGER NOT NULL,
  PRIMARY KEY (pp_option_id, subcat_id),
  FOREIGN KEY (pp_option_id) REFERENCES post_processing_options(id),
  FOREIGN KEY (subcat_id) REFERENCES pp_applicable_subcategories(id)
);
CREATE TABLE ai_layout_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_id INTEGER NOT NULL,        
  mode TEXT NOT NULL,                  
  status TEXT DEFAULT 'pending',       
  result_json TEXT,                    
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (analysis_id) REFERENCES ai_analysis_requests(id)
);
CREATE TABLE print_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  card_number TEXT,
  card_id INTEGER,
  order_number TEXT,
  file_path TEXT NOT NULL,
  file_name TEXT,
  printer_name TEXT,
  print_status TEXT NOT NULL,
  print_started_at TEXT,
  print_completed_at TEXT,
  output_width TEXT,
  output_height TEXT,
  dpi TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, equipment_id TEXT, copy_columns INTEGER DEFAULT 1, copy_rows INTEGER DEFAULT 1, copy_total INTEGER DEFAULT 1, tile_count INTEGER DEFAULT 0, tile_index INTEGER DEFAULT 0, actual_printed INTEGER, actual_printed_by TEXT, actual_printed_at DATETIME, print_duration_sec INTEGER, entity_id INTEGER DEFAULT 1, nest_members TEXT,
  UNIQUE(file_path, print_completed_at)
);
CREATE TABLE agent_heartbeats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL UNIQUE,
  agent_version TEXT,
  ip_address TEXT,
  last_seen_at DATETIME,
  print_log_path TEXT,
  status TEXT DEFAULT 'online',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
, equipment_id TEXT, is_printing INTEGER DEFAULT 0);
CREATE TABLE equipment (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  printer_name TEXT,
  ip_address TEXT,
  status TEXT DEFAULT 'ACTIVE',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
, equipment_status TEXT DEFAULT 'IDLE', head_count INTEGER DEFAULT 0, location_x REAL DEFAULT 50, location_y REAL DEFAULT 50, location_zone TEXT DEFAULT '', notes TEXT DEFAULT '', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, daily_capacity INTEGER DEFAULT 0, zone_id INTEGER REFERENCES facility_zones(id) ON DELETE SET NULL, size_type TEXT DEFAULT 'LARGE', avg_print_minutes_per_sqm REAL DEFAULT 0, working_hours_start TEXT DEFAULT '09:00', working_hours_end TEXT DEFAULT '18:00', entity_id INTEGER DEFAULT 1, last_seen_at DATETIME, print_log_path TEXT, agent_id TEXT, layout_rotation INTEGER NOT NULL DEFAULT 0);
CREATE TABLE equipment_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_id TEXT NOT NULL REFERENCES equipment(id),
  preset_name TEXT NOT NULL,
  tps_filename TEXT NOT NULL,
  description TEXT,
  is_default INTEGER DEFAULT 0,
  UNIQUE(equipment_id, preset_name)
);
CREATE TABLE purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_number TEXT UNIQUE NOT NULL,
  supplier_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK(status IN ('DRAFT','CONFIRMED','PARTIAL_RECEIVED','RECEIVED','CANCELLED')),
  order_date DATE DEFAULT CURRENT_DATE,
  expected_date DATE,
  total_amount REAL DEFAULT 0,
  vat_amount REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  final_amount REAL DEFAULT 0,
  notes TEXT,
  internal_notes TEXT,
  created_by INTEGER NOT NULL,
  updated_by INTEGER,
  confirmed_at DATETIME,
  confirmed_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, delivery_date TEXT, delivery_location TEXT, source_po_id INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL, entity_id INTEGER DEFAULT 1, receiving_locked_at DATETIME,
  FOREIGN KEY (supplier_id) REFERENCES clients(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE TABLE purchase_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id INTEGER NOT NULL,
  item_id INTEGER,
  item_name TEXT NOT NULL,
  category_name TEXT,
  quantity REAL NOT NULL DEFAULT 1,
  received_quantity REAL DEFAULT 0,
  unit TEXT DEFAULT 'EA',
  unit_price REAL DEFAULT 0,
  amount REAL DEFAULT 0,
  vat_included INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, accepted_quantity REAL DEFAULT 0, rejected_quantity REAL DEFAULT 0, storage_zone_id INTEGER REFERENCES storage_zones(id) ON DELETE SET NULL, line_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(line_status IN ('PENDING','PARTIAL','RECEIVED','CANCELLED')), received_by INTEGER REFERENCES users(id) ON DELETE SET NULL, received_at DATETIME, price_status TEXT NOT NULL DEFAULT 'CONFIRMED',
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id)
);
CREATE TABLE po_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id INTEGER NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by INTEGER NOT NULL,
  change_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id)
);
CREATE TABLE purchase_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL,
  payment_date DATE NOT NULL,
  amount REAL NOT NULL,
  payment_method TEXT,
  reference_number TEXT,
  po_id INTEGER,
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1,
  FOREIGN KEY (supplier_id) REFERENCES clients(id),
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE TABLE client_item_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  UNIQUE(client_id, item_id)
);
CREATE TABLE price_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  adjustment_percent REAL NOT NULL DEFAULT 0,
  description TEXT,
  is_default INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
, entity_id INTEGER DEFAULT 1);
CREATE TABLE purchase_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_number TEXT UNIQUE NOT NULL,
  requester_id INTEGER NOT NULL,
  supplier_id INTEGER,
  urgency TEXT NOT NULL DEFAULT 'NORMAL'
    CHECK(urgency IN ('LOW','NORMAL','HIGH','URGENT')),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK(status IN ('PENDING','APPROVED','REJECTED','CONVERTED')),
  reason TEXT,
  reject_reason TEXT,
  notes TEXT,
  approved_by INTEGER,
  approved_at DATETIME,
  converted_po_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, auto_approved INTEGER DEFAULT 0, entity_id INTEGER DEFAULT 1 REFERENCES entities(id),
  FOREIGN KEY (requester_id) REFERENCES users(id),
  FOREIGN KEY (supplier_id) REFERENCES clients(id),
  FOREIGN KEY (approved_by) REFERENCES users(id),
  FOREIGN KEY (converted_po_id) REFERENCES purchase_orders(id) ON DELETE SET NULL
);
CREATE TABLE purchase_request_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL,
  item_id INTEGER,
  item_name TEXT NOT NULL,
  category_name TEXT,
  quantity REAL DEFAULT 1,
  unit TEXT DEFAULT 'EA',
  estimated_unit_price REAL DEFAULT 0,
  admin_unit_price REAL,
  admin_quantity REAL,
  sort_order INTEGER DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1,
  FOREIGN KEY (request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id)
);
CREATE TABLE pr_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by INTEGER,
  change_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id)
);
CREATE TABLE bank_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bank_code TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_holder TEXT,
  connected_id TEXT,
  is_active INTEGER DEFAULT 1,
  last_synced_at DATETIME,
  last_synced_date TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
, entity_id INTEGER DEFAULT 1, barobill_registered INTEGER NOT NULL DEFAULT 0, collect_cycle TEXT, barobill_registered_at DATETIME, account_alias TEXT);
CREATE TABLE bank_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bank_account_id INTEGER NOT NULL,
  transaction_date TEXT NOT NULL,
  transaction_time TEXT,
  transaction_type TEXT NOT NULL CHECK(transaction_type IN ('DEPOSIT','WITHDRAWAL')),
  amount REAL NOT NULL,
  balance_after REAL,
  counterpart_name TEXT,
  description TEXT,
  codef_transaction_id TEXT,
  match_status TEXT DEFAULT 'UNMATCHED' CHECK(match_status IN ('UNMATCHED','SUGGESTED','CONFIRMED','APPLIED','IGNORED')),
  matched_client_id INTEGER,
  matched_payment_id INTEGER,
  matched_by INTEGER,
  matched_at DATETIME,
  match_confidence REAL,
  match_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1, matched_category_id INTEGER, content_key TEXT
  GENERATED ALWAYS AS (
    bank_account_id || '|' || transaction_date || '|' ||
    COALESCE(transaction_time, '') || '|' || transaction_type || '|' ||
    printf('%.2f', COALESCE(amount, 0)) || '|' ||
    CASE WHEN balance_after IS NOT NULL THEN printf('%.2f', balance_after)
         ELSE COALESCE(counterpart_name, '') END
  ) VIRTUAL, matched_fixed_expense_id INTEGER, transfer_pair_id INTEGER, matched_purchase_payment_id INTEGER, matched_link_mode TEXT,
  FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id),
  FOREIGN KEY (matched_client_id) REFERENCES clients(id)
);
CREATE TABLE tax_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT NOT NULL,              
  order_id INTEGER NOT NULL,
  invoice_type TEXT NOT NULL DEFAULT 'NORMAL',  
  modify_code TEXT,                          
  original_invoice_id INTEGER,               

  
  supplier_brn TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  supplier_representative TEXT,
  supplier_address TEXT,
  supplier_business_type TEXT,
  supplier_business_item TEXT,

  
  buyer_client_id INTEGER NOT NULL,
  buyer_brn TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  buyer_representative TEXT,
  buyer_address TEXT,
  buyer_business_type TEXT,
  buyer_business_item TEXT,
  buyer_email TEXT,

  
  supply_amount INTEGER NOT NULL,
  tax_amount INTEGER NOT NULL,
  total_amount INTEGER NOT NULL,

  
  status TEXT NOT NULL DEFAULT 'DRAFT',

  
  nts_approval_number TEXT,
  nts_sent_at DATETIME,
  nts_result_code TEXT,
  nts_result_message TEXT,

  
  provider_name TEXT,
  provider_invoice_id TEXT,
  provider_response TEXT,

  issue_date TEXT NOT NULL,                  
  notes TEXT,

  issued_by INTEGER,
  cancelled_at DATETIME,
  cancelled_by INTEGER,
  cancel_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1,

  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (buyer_client_id) REFERENCES clients(id),
  FOREIGN KEY (original_invoice_id) REFERENCES tax_invoices(id)
);
CREATE TABLE tax_invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tax_invoice_id INTEGER NOT NULL,
  item_date TEXT,
  item_name TEXT NOT NULL,
  specification TEXT,
  quantity REAL DEFAULT 1,
  unit_price INTEGER DEFAULT 0,
  supply_amount INTEGER NOT NULL,
  tax_amount INTEGER NOT NULL,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (tax_invoice_id) REFERENCES tax_invoices(id) ON DELETE CASCADE
);
CREATE TABLE tax_invoice_orders (
  tax_invoice_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  PRIMARY KEY (tax_invoice_id, order_id),
  FOREIGN KEY (tax_invoice_id) REFERENCES tax_invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
CREATE TABLE IF NOT EXISTS "card_status_history" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by INTEGER,
  change_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS "order_status_history" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by INTEGER,
  change_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  order_id INTEGER,
  type TEXT NOT NULL DEFAULT 'DISCOUNT',
  amount INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT UNIQUE NOT NULL,
  client_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN (
    'QUOTATION',
    'DRAFT',
    'CONFIRMED',
    'PRINTING',
    'PRINT_DONE',
    'SHIPPED',
    'HOLD',
    'CANCELLED'
  )) DEFAULT 'DRAFT',
  order_year INTEGER,
  order_month INTEGER,
  reception_location TEXT,
  delivery_info TEXT,
  delivery_date DATE,
  order_date DATE DEFAULT CURRENT_DATE,
  total_amount REAL DEFAULT 0,
  vat_amount REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  final_amount REAL DEFAULT 0,
  notes TEXT,
  internal_notes TEXT,
  created_by INTEGER NOT NULL,
  updated_by INTEGER,
  confirmed_at DATETIME,
  confirmed_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ai_file_path TEXT,
  ai_analysis_id INTEGER,
  layout_id INTEGER DEFAULT NULL,
  layout_output_1 TEXT DEFAULT NULL,
  layout_output_2 TEXT DEFAULT NULL,
  priority TEXT DEFAULT 'NORMAL' CHECK(priority IN ('NORMAL', 'URGENT')),
  delivery_method TEXT DEFAULT '배송',
  delivery_time TEXT DEFAULT NULL,
  contact_phone TEXT DEFAULT NULL,
  contact_mobile TEXT DEFAULT NULL,
  shipping_payment TEXT DEFAULT NULL,
  billing_status TEXT DEFAULT NULL,
  billed_at DATETIME DEFAULT NULL,
  billed_by INTEGER DEFAULT NULL,
  billed_amount INTEGER DEFAULT NULL,
  valid_until TEXT, external_order_number TEXT, entity_id INTEGER DEFAULT 1, sheet_layout_params TEXT, output_folder TEXT, billable_after TEXT, order_type TEXT NOT NULL DEFAULT 'PRODUCTION', auto_complete_date TEXT, cancel_reason TEXT, quotation_id INTEGER DEFAULT NULL REFERENCES quotations(id) ON DELETE SET NULL, credit_status TEXT, has_pending_prices INTEGER NOT NULL DEFAULT 0, accounting_date DATE, shipped_at DATETIME, consolidate_with_order_id INTEGER,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (confirmed_by) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TABLE order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  item_id INTEGER,
  item_name TEXT NOT NULL,
  category_name TEXT,
  width REAL,
  height REAL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'EA',
  unit_price REAL DEFAULT 0,
  amount REAL DEFAULT 0,
  vat_included INTEGER DEFAULT 1,
  post_processing TEXT,
  content TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ai_group_index INTEGER DEFAULT NULL,
  scale_factor REAL DEFAULT 1,
  ai_analysis_id INTEGER DEFAULT NULL,
  parent_item_id INTEGER DEFAULT NULL, material_cost REAL DEFAULT 0, ink_cost REAL DEFAULT 0, pp_cost REAL DEFAULT 0, total_cost REAL DEFAULT 0, unit_cost REAL DEFAULT 0, margin_rate REAL DEFAULT 0, shipment_ready INTEGER DEFAULT 0, finishing TEXT, price_status TEXT NOT NULL DEFAULT 'CONFIRMED', ai_file_id INTEGER REFERENCES order_ai_files(id), specification TEXT, assigned_entity_id INTEGER, assignment_status TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT
);
CREATE TABLE card_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL,
  order_item_id INTEGER NOT NULL,
  quantity INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, print_completed INTEGER DEFAULT 0, print_completed_at DATETIME, print_completed_by INTEGER, source_file_path TEXT, rip_equipment_id TEXT, rip_preset TEXT, rip_status TEXT, rip_queued_at DATETIME, rip_sent_at DATETIME, rip_job_path TEXT, rip_retry_count INTEGER DEFAULT 0, rip_error_reason TEXT,
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
  FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE
);
CREATE TABLE equipment_heads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_id TEXT NOT NULL,
  head_number INTEGER NOT NULL,
  status TEXT DEFAULT 'NORMAL',
  replaced_at DATETIME,
  notes TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,
  UNIQUE(equipment_id, head_number)
);
CREATE TABLE maintenance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_id TEXT NOT NULL,
  log_type TEXT NOT NULL DEFAULT 'MAINTENANCE',
  description TEXT NOT NULL,
  cost INTEGER DEFAULT 0,
  performed_by INTEGER,
  performed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, severity TEXT DEFAULT 'NORMAL', downtime_minutes INTEGER DEFAULT 0, resolved_at DATETIME, schedule_id INTEGER,
  FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,
  FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE pr_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_number TEXT UNIQUE NOT NULL,       
  order_id INTEGER NOT NULL,                   
  status TEXT NOT NULL DEFAULT 'PREPARING'
    CHECK(status IN ('PREPARING','SHIPPED','IN_TRANSIT','DELIVERED','CANCELLED')),

  
  delivery_type TEXT NOT NULL DEFAULT 'DELIVERY'
    CHECK(delivery_type IN ('DELIVERY','PICKUP','FREIGHT','QUICK')),
  courier_name TEXT,                           
  tracking_number TEXT,                        

  
  shipped_at DATETIME,                         
  delivered_at DATETIME,                       

  
  receiver_name TEXT,                          
  receiver_phone TEXT,                         
  receiver_address TEXT,                       

  
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, label_count INTEGER DEFAULT 1, box_count INTEGER DEFAULT 1, entity_id INTEGER DEFAULT 1, merged_into_id INTEGER,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE TABLE po_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    supplier_id INTEGER,
    notes TEXT,
    created_by INTEGER,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE po_template_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL REFERENCES po_templates(id),
    item_id INTEGER,
    item_name TEXT NOT NULL,
    category_name TEXT,
    quantity REAL DEFAULT 1,
    unit TEXT DEFAULT 'EA',
    unit_price REAL DEFAULT 0,
    vat_included INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1
);
CREATE TABLE collection_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    contact_date DATE NOT NULL,
    contact_method TEXT NOT NULL,  
    contact_person TEXT DEFAULT NULL,
    promised_date DATE DEFAULT NULL,
    promised_amount REAL DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    created_by INTEGER DEFAULT NULL REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
, amount_requested REAL, result TEXT, entity_id INTEGER DEFAULT 1);
CREATE TABLE client_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    note_type TEXT NOT NULL DEFAULT 'GENERAL',  
    content TEXT NOT NULL,
    created_by INTEGER DEFAULT NULL REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
, entity_id INTEGER DEFAULT 1);
CREATE TABLE activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  user_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  entity_label TEXT,
  details TEXT,
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
, actor_entity_id INTEGER);
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  target_role TEXT,
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  is_read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
, entity_id INTEGER DEFAULT 1);
CREATE TABLE equipment_consumables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_id TEXT NOT NULL,
  name TEXT NOT NULL,
  replacement_cycle_days INTEGER DEFAULT 0,
  last_replaced_at DATETIME,
  next_due_at DATETIME,
  quantity_on_hand INTEGER DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1,
  FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
);
CREATE TABLE maintenance_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  interval_days INTEGER NOT NULL DEFAULT 30,
  checklist TEXT,
  last_performed_at DATETIME,
  next_due_at DATETIME,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1,
  FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
);
CREATE TABLE cost_standards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_name TEXT NOT NULL,
  media_cost_per_sqm REAL DEFAULT 0,
  ink_cost_per_sqm REAL DEFAULT 0,
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(category_name)
);
CREATE TABLE email_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    recipient_name TEXT,
    subject TEXT NOT NULL,
    related_type TEXT,
    related_id INTEGER,
    status TEXT DEFAULT 'SENT',
    error_message TEXT,
    sent_by INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now','localtime'))
, entity_id INTEGER DEFAULT 1);
CREATE TABLE fixed_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('RENT','INSURANCE','UTILITY','LEASE','SALARY','TAX','OTHER')),
  amount REAL NOT NULL DEFAULT 0,
  frequency TEXT NOT NULL DEFAULT 'MONTHLY' CHECK(frequency IN ('MONTHLY','QUARTERLY','YEARLY')),
  payment_day INTEGER DEFAULT 1,
  start_date TEXT NOT NULL,
  end_date TEXT,
  counterpart_name TEXT,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1, amount_type TEXT NOT NULL DEFAULT 'FIXED', estimate_method TEXT, linked_category_id INTEGER,
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE TABLE loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loan_number TEXT,
  creditor TEXT NOT NULL,
  description TEXT,
  original_amount REAL NOT NULL,
  current_balance REAL NOT NULL,
  rate_type TEXT DEFAULT 'FIXED' CHECK(rate_type IN ('FIXED','VARIABLE')),
  current_rate REAL DEFAULT 0,
  repayment_type TEXT DEFAULT 'EQUAL_INSTALLMENT'
    CHECK(repayment_type IN ('EQUAL_PRINCIPAL','EQUAL_INSTALLMENT','BULLET','INTEREST_ONLY')),
  start_date TEXT NOT NULL,
  maturity_date TEXT NOT NULL,
  monthly_payment_day INTEGER DEFAULT 1,
  monthly_payment_amount REAL DEFAULT 0,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1,
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE TABLE loan_rate_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loan_id INTEGER NOT NULL,
  effective_date TEXT NOT NULL,
  rate REAL NOT NULL,
  changed_by INTEGER,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1,
  FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id)
);
CREATE TABLE loan_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loan_id INTEGER NOT NULL,
  payment_number INTEGER NOT NULL,
  scheduled_date TEXT NOT NULL,
  principal_amount REAL DEFAULT 0,
  interest_amount REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  actual_paid_amount REAL,
  actual_paid_date TEXT,
  status TEXT DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED','PAID','OVERDUE','PARTIAL')),
  bank_transaction_id INTEGER,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1,
  FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
  FOREIGN KEY (bank_transaction_id) REFERENCES bank_transactions(id)
);
CREATE TABLE facility_zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3B82F6',
  sort_order INTEGER DEFAULT 0,
  bounds TEXT DEFAULT '{"x":10,"y":10,"width":200,"height":150}',
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE facility_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE inventory_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_id INTEGER,
  name TEXT NOT NULL,
  location_x REAL DEFAULT 50,
  location_y REAL DEFAULT 50,
  location_type TEXT DEFAULT 'STORAGE' CHECK(location_type IN ('STORAGE','STAGING','OUTPUT')),
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (zone_id) REFERENCES facility_zones(id) ON DELETE SET NULL
);
CREATE TABLE bom_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER,                         
  category_name TEXT,                      
  material_item_id INTEGER NOT NULL,       
  material_name TEXT NOT NULL,             
  usage_per_sqm REAL NOT NULL DEFAULT 0,   
  usage_unit TEXT NOT NULL DEFAULT 'M',    
  waste_factor REAL NOT NULL DEFAULT 1.0,  
  is_active INTEGER DEFAULT 1,
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL,
  FOREIGN KEY (material_item_id) REFERENCES inventory(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id),
  CHECK (item_id IS NOT NULL OR category_name IS NOT NULL)
);
CREATE TABLE mrp_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_number TEXT NOT NULL UNIQUE,         
  run_type TEXT NOT NULL DEFAULT 'MANUAL'
    CHECK(run_type IN ('MANUAL','AUTO','ORDER')),
  date_from TEXT,                          
  date_to TEXT,                            
  order_id INTEGER,                        
  status TEXT NOT NULL DEFAULT 'COMPLETED'
    CHECK(status IN ('RUNNING','COMPLETED','FAILED')),
  total_materials INTEGER DEFAULT 0,
  shortfall_count INTEGER DEFAULT 0,
  auto_pr_created INTEGER DEFAULT 0,
  notes TEXT,
  run_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  FOREIGN KEY (run_by) REFERENCES users(id)
);
CREATE TABLE mrp_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  material_item_id INTEGER NOT NULL,
  material_name TEXT NOT NULL,
  required_quantity REAL DEFAULT 0,        
  current_stock REAL DEFAULT 0,            
  on_order_quantity REAL DEFAULT 0,        
  shortfall REAL DEFAULT 0,               
  auto_pr_id INTEGER,                      
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1,
  FOREIGN KEY (run_id) REFERENCES mrp_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (material_item_id) REFERENCES inventory(id),
  FOREIGN KEY (auto_pr_id) REFERENCES purchase_requests(id) ON DELETE SET NULL
);
CREATE TABLE approval_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL,
  step_order INTEGER NOT NULL,
  approver_id INTEGER,                     
  approver_role TEXT,                      
  label TEXT,                              
  status TEXT DEFAULT 'PENDING'
    CHECK(status IN ('PENDING','APPROVED','REJECTED','SKIPPED')),
  comment TEXT,
  acted_at DATETIME, entity_id INTEGER DEFAULT 1,
  FOREIGN KEY (request_id) REFERENCES approval_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (approver_id) REFERENCES users(id)
);
CREATE TABLE approval_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_data TEXT,                           
  uploaded_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1, r2_key TEXT,
  FOREIGN KEY (request_id) REFERENCES approval_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);
CREATE TABLE client_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  login_id TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  is_active INTEGER DEFAULT 1,
  last_login_at DATETIME,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE TABLE portal_access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_account_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1,
  FOREIGN KEY (client_account_id) REFERENCES client_accounts(id) ON DELETE CASCADE
);
CREATE TABLE portal_reorder_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_account_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  reference_order_id INTEGER,
  description TEXT,
  file_urls TEXT,                           
  status TEXT DEFAULT 'PENDING'
    CHECK(status IN ('PENDING','CONFIRMED','REJECTED')),
  handled_by INTEGER,
  handled_at DATETIME,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1,
  FOREIGN KEY (client_account_id) REFERENCES client_accounts(id),
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (reference_order_id) REFERENCES orders(id),
  FOREIGN KEY (handled_by) REFERENCES users(id)
);
CREATE TABLE print_file_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL,
  file_seq INTEGER NOT NULL,
  card_id INTEGER,
  card_number TEXT,
  order_item_id INTEGER,
  file_name TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1,
  UNIQUE(order_number, file_seq)
);
CREATE TABLE purchase_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL,            
  po_id INTEGER,                           
  type TEXT NOT NULL CHECK(type IN ('DISCOUNT','CLAIM','RETURN','OTHER')),
  amount REAL NOT NULL,                    
  reason TEXT,                             
  adjustment_date DATE NOT NULL,           
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1,
  FOREIGN KEY (supplier_id) REFERENCES clients(id),
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE TABLE cash_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_number TEXT NOT NULL UNIQUE,           
  receipt_type TEXT NOT NULL DEFAULT 'EXPENSE',  
  trade_type TEXT NOT NULL DEFAULT 'CONSUMER',   
  identity_type TEXT NOT NULL DEFAULT 'PHONE',   
  identity_number TEXT NOT NULL,                 

  client_id INTEGER REFERENCES clients(id),
  order_id INTEGER REFERENCES orders(id),

  trade_date TEXT NOT NULL,                      
  supply_amount INTEGER NOT NULL DEFAULT 0,      
  tax_amount INTEGER NOT NULL DEFAULT 0,         
  total_amount INTEGER NOT NULL DEFAULT 0,       
  service_amount INTEGER NOT NULL DEFAULT 0,     
  item_name TEXT,                                

  status TEXT NOT NULL DEFAULT 'DRAFT',          
  provider_name TEXT,                            
  provider_response TEXT,                        
  provider_receipt_id TEXT,                      
  nts_approval_number TEXT,                      
  nts_result_code TEXT,
  nts_result_message TEXT,

  issued_at TEXT,
  issued_by INTEGER REFERENCES users(id),
  cancelled_at TEXT,
  cancel_reason TEXT,
  notes TEXT,

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
, entity_id INTEGER DEFAULT 1);
CREATE TABLE hometax_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,                          
  job_type TEXT NOT NULL,                        
  start_date TEXT NOT NULL,                      
  end_date TEXT NOT NULL,                        
  state INTEGER DEFAULT 0,                       
  result INTEGER,                                
  message TEXT,
  total_count INTEGER DEFAULT 0,
  requested_by INTEGER REFERENCES users(id),
  requested_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
, entity_id INTEGER DEFAULT 1);
CREATE TABLE hometax_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER REFERENCES hometax_jobs(id),
  invoice_type TEXT NOT NULL,                    
  nts_confirm_number TEXT,                       
  issue_date TEXT,                               
  send_date TEXT,                                

  supply_amount INTEGER DEFAULT 0,               
  tax_amount INTEGER DEFAULT 0,                  
  total_amount INTEGER DEFAULT 0,                

  issuer_corp_num TEXT,                          
  issuer_corp_name TEXT,                         
  issuer_ceo_name TEXT,                          
  receiver_corp_num TEXT,                        
  receiver_corp_name TEXT,                       
  receiver_ceo_name TEXT,                        

  invoice_detail_type TEXT,                      
  tax_type TEXT,                                 
  purpose_type TEXT,                             

  matched_invoice_id INTEGER REFERENCES tax_invoices(id),  
  match_status TEXT DEFAULT 'UNMATCHED',         
  match_note TEXT,                               

  raw_data TEXT,                                 
  collected_at TEXT DEFAULT CURRENT_TIMESTAMP
, entity_id INTEGER DEFAULT 1);
CREATE TABLE product_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_item_id INTEGER NOT NULL,
  material_item_id INTEGER NOT NULL,
  is_default INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_item_id) REFERENCES items(id),
  FOREIGN KEY (material_item_id) REFERENCES items(id),
  UNIQUE(product_item_id, material_item_id)
);
CREATE TABLE inventory_auto_deductions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  print_event_id INTEGER NOT NULL,
  material_item_id INTEGER NOT NULL,
  deducted_length_mm REAL NOT NULL,
  deducted_length_yd REAL NOT NULL,
  output_width_mm REAL NOT NULL,
  output_height_mm REAL NOT NULL,
  copy_total INTEGER DEFAULT 1,
  inventory_before REAL,
  inventory_after REAL,
  matched_width_mm INTEGER,
  card_id INTEGER,
  order_number TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1, deduction_method TEXT DEFAULT 'ROLL', deducted_base REAL,
  FOREIGN KEY (print_event_id) REFERENCES print_events(id),
  FOREIGN KEY (material_item_id) REFERENCES items(id)
);
CREATE TABLE inventory_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  count_number TEXT NOT NULL UNIQUE,
  count_date TEXT NOT NULL,
  count_type TEXT DEFAULT 'FULL',
  status TEXT DEFAULT 'DRAFT',
  submitted_by TEXT,
  submitted_at DATETIME,
  approved_by TEXT,
  approved_at DATETIME,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
, entity_id INTEGER DEFAULT 1, storage_zone_id INTEGER REFERENCES storage_zones(id) ON DELETE SET NULL);
CREATE TABLE inventory_count_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  count_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  system_quantity REAL NOT NULL,
  counted_quantity REAL,
  difference REAL,
  difference_pct REAL,
  unit TEXT DEFAULT 'YD',
  notes TEXT, storage_zone_id INTEGER REFERENCES storage_zones(id) ON DELETE SET NULL,
  FOREIGN KEY (count_id) REFERENCES inventory_counts(id),
  FOREIGN KEY (item_id) REFERENCES items(id)
);
CREATE TABLE cost_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period TEXT NOT NULL,
  material_item_id INTEGER,
  category_name TEXT,
  total_consumed_yd REAL DEFAULT 0,
  total_consumed_sqm REAL DEFAULT 0,
  total_produced_sqm REAL DEFAULT 0,
  loss_rate REAL DEFAULT 0,
  total_material_cost REAL DEFAULT 0,
  avg_purchase_price_yd REAL DEFAULT 0,
  material_cost_per_sqm REAL DEFAULT 0,
  ink_total_cost REAL DEFAULT 0,
  ink_cost_per_sqm REAL DEFAULT 0,
  total_cost_per_sqm REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1,
  UNIQUE(period, material_item_id, category_name)
);
CREATE TABLE auto_process_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  order_item_id INTEGER NOT NULL,
  ai_analysis_id INTEGER,
  ai_group_index INTEGER,

  
  source_path TEXT,
  product TEXT,
  width_cm REAL,
  height_cm REAL,
  finishing TEXT,
  scale_factor INTEGER DEFAULT 1,
  clip_bounds TEXT,
  margins TEXT,

  
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','processing','done','approved','failed')),
  ia_params TEXT,

  
  output_eps_path TEXT,
  output_png_path TEXT,
  output_png_base64 TEXT,
  error_message TEXT,

  
  saved_path TEXT,

  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  approved_at DATETIME,
  approved_by INTEGER
, entity_id INTEGER DEFAULT 1);
CREATE TABLE stock_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL DEFAULT 'LOW_STOCK',  
  current_quantity REAL NOT NULL,
  threshold_quantity REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',  
  acknowledged_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at DATETIME,
  linked_pr_id INTEGER REFERENCES purchase_requests(id) ON DELETE SET NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME
, entity_id INTEGER DEFAULT 1);
CREATE TABLE inspection_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_name TEXT NOT NULL,
  category_name TEXT,  
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE inspection_template_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES inspection_templates(id) ON DELETE CASCADE,
  check_item TEXT NOT NULL,  
  check_type TEXT NOT NULL DEFAULT 'PASS_FAIL',  
  description TEXT,  
  is_required INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE inspection_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id INTEGER NOT NULL REFERENCES inventory_receipts(id) ON DELETE CASCADE,
  receipt_item_id INTEGER REFERENCES inventory_receipt_items(id) ON DELETE CASCADE,
  template_id INTEGER REFERENCES inspection_templates(id) ON DELETE SET NULL,
  inspector_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  overall_result TEXT NOT NULL DEFAULT 'PENDING',  
  notes TEXT,
  inspected_at DATETIME DEFAULT CURRENT_TIMESTAMP
, entity_id INTEGER DEFAULT 1);
CREATE TABLE inspection_result_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  result_id INTEGER NOT NULL REFERENCES inspection_results(id) ON DELETE CASCADE,
  template_item_id INTEGER REFERENCES inspection_template_items(id) ON DELETE SET NULL,
  check_item TEXT NOT NULL,
  check_result TEXT NOT NULL DEFAULT 'PENDING',  
  value TEXT,  
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE migration_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  migration_type TEXT NOT NULL,       
  status TEXT DEFAULT 'PENDING',      
  total_rows INTEGER DEFAULT 0,
  imported_rows INTEGER DEFAULT 0,
  skipped_rows INTEGER DEFAULT 0,
  error_rows INTEGER DEFAULT 0,
  errors_json TEXT,                   
  started_at TEXT,
  completed_at TEXT,
  created_by INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
, entity_id INTEGER);
CREATE TABLE billing_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_name TEXT NOT NULL,           
  notes TEXT,                         
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
, entity_id INTEGER DEFAULT 1);
CREATE TABLE kakao_send_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_num TEXT,                       
  template_code TEXT NOT NULL,            
  send_type TEXT NOT NULL DEFAULT 'ATS',  

  
  receiver_num TEXT NOT NULL,             
  receiver_name TEXT,                     

  
  related_type TEXT,                      
  related_id INTEGER,                     
  client_id INTEGER REFERENCES clients(id),

  
  content TEXT,                           
  alt_content TEXT,                       

  
  status TEXT NOT NULL DEFAULT 'PENDING', 
  result_code TEXT,                       
  result_message TEXT,                    

  
  sent_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
, channel TEXT DEFAULT 'kakao', entity_id INTEGER DEFAULT 1);
CREATE TABLE cash_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_date TEXT NOT NULL,           
  flow_type TEXT NOT NULL,               
  source_type TEXT NOT NULL,             
  source_id INTEGER,                     
  client_id INTEGER,                     
  amount REAL NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'PENDING',         
  actual_date TEXT,                      
  actual_amount REAL,                    
  bank_transaction_id INTEGER,           
  notes TEXT,
  created_by INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
, entity_id INTEGER DEFAULT 1);
CREATE TABLE payment_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_number TEXT NOT NULL UNIQUE,   
  request_date TEXT NOT NULL,
  request_type TEXT NOT NULL,            
  recipient_client_id INTEGER,           
  recipient_name TEXT NOT NULL,          
  recipient_account TEXT,                
  recipient_bank TEXT,                   
  amount REAL NOT NULL,
  description TEXT NOT NULL,             
  related_po_id INTEGER,                 
  status TEXT DEFAULT 'DRAFT',           
  approved_by INTEGER,
  approved_at TEXT,
  paid_at TEXT,
  paid_by INTEGER,
  bank_transaction_id INTEGER,
  attachment_url TEXT,
  notes TEXT,
  reject_reason TEXT,
  created_by INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
, entity_id INTEGER DEFAULT 1, card_transaction_id INTEGER REFERENCES card_transactions(id));
CREATE TABLE leave_balances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  year INTEGER NOT NULL,                       
  leave_type TEXT NOT NULL DEFAULT 'ANNUAL',   
  accrued REAL NOT NULL DEFAULT 0,             
  granted_extra REAL NOT NULL DEFAULT 0,       
  used REAL NOT NULL DEFAULT 0,                
  carried_over REAL NOT NULL DEFAULT 0,        
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1, expire_date TEXT, expired REAL NOT NULL DEFAULT 0,
  UNIQUE(employee_id, year, leave_type),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);
CREATE TABLE leave_accrual_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  accrual_type TEXT NOT NULL,                  
  days REAL NOT NULL,                          
  reason TEXT,                                 
  run_at DATETIME DEFAULT CURRENT_TIMESTAMP,   
  run_by INTEGER, entity_id INTEGER DEFAULT 1,                              
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (run_by) REFERENCES users(id)
);
CREATE TABLE insurance_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,                              
  insurance_type TEXT NOT NULL,                       
  total_rate REAL NOT NULL,                           
  employee_rate REAL NOT NULL DEFAULT 0,              
  employer_rate REAL NOT NULL DEFAULT 0,              
  base TEXT NOT NULL DEFAULT 'TAXABLE_PAY',           
  min_base INTEGER,                                   
  max_base INTEGER,                                   
  effective_from DATE NOT NULL,
  effective_to DATE,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(year, insurance_type)
);
CREATE TABLE income_tax_table (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,                              
  monthly_pay_min INTEGER NOT NULL,                   
  monthly_pay_max INTEGER NOT NULL,                   
  dependents_1 INTEGER DEFAULT 0,                     
  dependents_2 INTEGER DEFAULT 0,                     
  dependents_3 INTEGER DEFAULT 0,
  dependents_4 INTEGER DEFAULT 0,
  dependents_5 INTEGER DEFAULT 0,
  dependents_6 INTEGER DEFAULT 0,
  dependents_7 INTEGER DEFAULT 0,
  dependents_8 INTEGER DEFAULT 0,
  dependents_9 INTEGER DEFAULT 0,
  dependents_10 INTEGER DEFAULT 0,
  dependents_11 INTEGER DEFAULT 0,                    
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE caps_sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME,
  status TEXT NOT NULL DEFAULT 'RUNNING',
    
  fetched_count INTEGER DEFAULT 0,   
  inserted_count INTEGER DEFAULT 0,  
  updated_count INTEGER DEFAULT 0,   
  skipped_count INTEGER DEFAULT 0,   
  error_count INTEGER DEFAULT 0,
  error_message TEXT,
  trigger_type TEXT DEFAULT 'SCHEDULED',
    
  triggered_by INTEGER,              
  from_date DATE,
  to_date DATE,
  notes TEXT
, site_id TEXT DEFAULT 'DJ');
CREATE TABLE year_end_settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT', 

  
  total_salary INTEGER DEFAULT 0,       
  total_nontax INTEGER DEFAULT 0,       
  gross_taxable INTEGER DEFAULT 0,      

  
  earned_income_deduction INTEGER DEFAULT 0,  

  
  basic_deduction INTEGER DEFAULT 0,          
  dependents_count INTEGER DEFAULT 1,         
  additional_aged INTEGER DEFAULT 0,          
  additional_disabled INTEGER DEFAULT 0,      
  additional_single_parent INTEGER DEFAULT 0, 

  
  insurance_deduction INTEGER DEFAULT 0,      
  medical_deduction INTEGER DEFAULT 0,        
  education_deduction INTEGER DEFAULT 0,      
  housing_deduction INTEGER DEFAULT 0,        
  donation_deduction INTEGER DEFAULT 0,       

  
  pension_saving INTEGER DEFAULT 0,           
  credit_card_deduction INTEGER DEFAULT 0,    

  
  taxable_income INTEGER DEFAULT 0,           
  calculated_tax INTEGER DEFAULT 0,           

  
  earned_tax_credit INTEGER DEFAULT 0,        
  child_tax_credit INTEGER DEFAULT 0,         
  pension_contribution_credit INTEGER DEFAULT 0,  
  insurance_premium_credit INTEGER DEFAULT 0,     
  medical_credit INTEGER DEFAULT 0,           
  education_credit INTEGER DEFAULT 0,         
  donation_credit INTEGER DEFAULT 0,          
  standard_tax_credit INTEGER DEFAULT 0,      

  
  determined_tax INTEGER DEFAULT 0,           
  determined_local_tax INTEGER DEFAULT 0,     

  
  prepaid_income_tax INTEGER DEFAULT 0,       
  prepaid_local_tax INTEGER DEFAULT 0,        

  
  refund_income_tax INTEGER DEFAULT 0,        
  refund_local_tax INTEGER DEFAULT 0,         
  refund_total INTEGER DEFAULT 0,             

  
  notes TEXT,
  calculated_at TEXT,
  confirmed_by INTEGER,
  confirmed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')), entity_id INTEGER DEFAULT 1,

  UNIQUE(employee_id, year)
);
CREATE TABLE year_end_deduction_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  settlement_id INTEGER NOT NULL,
  category TEXT NOT NULL,    
  sub_category TEXT,         
  description TEXT,          
  amount INTEGER DEFAULT 0,  
  deductible_amount INTEGER DEFAULT 0,  
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (settlement_id) REFERENCES year_end_settlements(id) ON DELETE CASCADE
);
CREATE TABLE insurance_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,           
  report_type TEXT NOT NULL,        
  status TEXT NOT NULL DEFAULT 'DRAFT',  

  
  employee_count INTEGER DEFAULT 0,
  total_national_pension INTEGER DEFAULT 0,
  total_health_insurance INTEGER DEFAULT 0,
  total_long_term_care INTEGER DEFAULT 0,
  total_employment_insurance INTEGER DEFAULT 0,
  total_industrial_accident INTEGER DEFAULT 0,  
  employer_national_pension INTEGER DEFAULT 0,
  employer_health_insurance INTEGER DEFAULT 0,
  employer_long_term_care INTEGER DEFAULT 0,
  employer_employment_insurance INTEGER DEFAULT 0,
  grand_total_employee INTEGER DEFAULT 0,   
  grand_total_employer INTEGER DEFAULT 0,   
  grand_total INTEGER DEFAULT 0,            

  notes TEXT,
  submitted_at TEXT,
  confirmed_by INTEGER,
  confirmed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')), entity_id INTEGER DEFAULT 1,

  UNIQUE(year, month, report_type)
);
CREATE TABLE insurance_report_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  employee_name TEXT,
  rrn TEXT,                         
  base_salary INTEGER DEFAULT 0,    

  
  national_pension INTEGER DEFAULT 0,
  health_insurance INTEGER DEFAULT 0,
  long_term_care INTEGER DEFAULT 0,
  employment_insurance INTEGER DEFAULT 0,

  
  employer_national_pension INTEGER DEFAULT 0,
  employer_health_insurance INTEGER DEFAULT 0,
  employer_long_term_care INTEGER DEFAULT 0,
  employer_employment_insurance INTEGER DEFAULT 0,
  employer_industrial_accident INTEGER DEFAULT 0,

  
  acquisition_date TEXT,            
  loss_date TEXT,                   
  loss_reason TEXT,                 

  FOREIGN KEY (report_id) REFERENCES insurance_reports(id) ON DELETE CASCADE
);
CREATE TABLE leave_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,           
  name TEXT NOT NULL,                  
  category TEXT NOT NULL DEFAULT 'ANNUAL',  
  deduction_days REAL NOT NULL DEFAULT 1.0, 
  time_from TEXT,                      
  time_to TEXT,                        
  is_paid INTEGER NOT NULL DEFAULT 1,  
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE family_event_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL UNIQUE,     
  paid_days INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS "tasks" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('AI_PROCESS', 'MANUAL')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN (
    'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'
  )),
  order_id INTEGER,
  card_id INTEGER,
  ref_table TEXT,
  ref_id INTEGER,
  input_payload TEXT,
  output_payload TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  last_attempt_at DATETIME,
  started_at DATETIME,
  completed_at DATETIME,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE inventory_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  transaction_type TEXT NOT NULL,
  transaction_date DATETIME NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL,
  total_amount REAL,
  reference_type TEXT,
  reference_id INTEGER,
  balance_after REAL NOT NULL,
  reason TEXT,
  handled_by INTEGER,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1, storage_zone_id INTEGER REFERENCES storage_zones(id) ON DELETE SET NULL,
  FOREIGN KEY (item_id) REFERENCES items(id),
  FOREIGN KEY (handled_by) REFERENCES users(id)
);
CREATE TABLE inventory_release_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  release_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  quantity REAL NOT NULL,
  notes TEXT,
  FOREIGN KEY (release_id) REFERENCES inventory_releases(id),
  FOREIGN KEY (item_id) REFERENCES items(id)
);
CREATE TABLE inventory_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  adjustment_date DATE NOT NULL,
  quantity_before REAL NOT NULL,
  quantity_after REAL NOT NULL,
  adjustment_quantity REAL NOT NULL,
  reason TEXT NOT NULL,
  adjusted_by INTEGER NOT NULL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1 REFERENCES entities(id),
  FOREIGN KEY (item_id) REFERENCES items(id),
  FOREIGN KEY (adjusted_by) REFERENCES users(id)
);
CREATE TABLE permission_pages (
  page_key TEXT PRIMARY KEY,        
  page_label TEXT NOT NULL,          
  page_section TEXT NOT NULL,        
  page_icon TEXT,                    
  badge_id TEXT,                     
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,       
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE portal_access_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    client_id INTEGER NOT NULL,
    expires_at DATETIME NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
, metadata TEXT, entity_id INTEGER DEFAULT 1);
CREATE TABLE message_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL CHECK(channel IN ('sms', 'email', 'fax')),
  name TEXT NOT NULL,
  subject TEXT,
  content TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
, entity_id INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS "inventory_receipt_items" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id INTEGER NOT NULL,
  item_id INTEGER,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  amount REAL NOT NULL,
  location TEXT,
  notes TEXT,
  received_quantity REAL DEFAULT 0,
  accepted_quantity REAL DEFAULT 0,
  rejected_quantity REAL DEFAULT 0,
  quality_status TEXT,
  reject_memo TEXT,
  po_item_id INTEGER, unit TEXT,
  FOREIGN KEY (receipt_id) REFERENCES inventory_receipts(id),
  FOREIGN KEY (item_id) REFERENCES items(id)
);
CREATE TABLE entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                    
  short_name TEXT NOT NULL,              
  business_reg_no TEXT,                  
  representative TEXT,                   
  business_type TEXT,                    
  business_item TEXT,                    
  address TEXT,
  phone TEXT,
  email TEXT,
  tax_email TEXT,                        
  popbill_corp_num TEXT,                 
  bank_info TEXT,                        
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
, stamp_base64 TEXT, fax TEXT, logo_base64 TEXT, email_from_address TEXT, email_from_name TEXT, webhard_url TEXT);
CREATE TABLE entity_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id INTEGER NOT NULL REFERENCES entities(id),
  setting_key TEXT NOT NULL,
  setting_value TEXT DEFAULT '',
  UNIQUE(entity_id, setting_key)
);
CREATE TABLE price_change_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL,        
  target_id INTEGER NOT NULL,
  target_name TEXT,
  old_price REAL,
  new_price REAL,
  changed_by INTEGER,
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
, field_name TEXT, old_value REAL, new_value REAL, entity_id INTEGER DEFAULT 1);
CREATE TABLE finishing_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  margin_cm REAL NOT NULL DEFAULT 0,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
, method_group TEXT DEFAULT 'output');
CREATE TABLE finishing_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  config TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
, method_group TEXT DEFAULT 'output');
CREATE TABLE client_price_rates (id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL, category TEXT, rate_percent REAL NOT NULL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (client_id) REFERENCES clients(id));
CREATE TABLE price_policies (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, is_default INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1);
CREATE TABLE price_policy_rules (id INTEGER PRIMARY KEY AUTOINCREMENT, policy_id INTEGER NOT NULL, category TEXT, item_id INTEGER, rate_percent REAL DEFAULT 0, fixed_price REAL, sort_order INTEGER DEFAULT 0, FOREIGN KEY (policy_id) REFERENCES price_policies(id) ON DELETE CASCADE, FOREIGN KEY (item_id) REFERENCES items(id));
CREATE TABLE quotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quotation_number TEXT UNIQUE NOT NULL,
  client_id INTEGER NOT NULL,
  entity_id INTEGER DEFAULT 1,
  status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'EXPIRED', 'CANCELLED')) DEFAULT 'ACTIVE',

  
  quotation_date DATE DEFAULT CURRENT_DATE,
  delivery_date DATE,
  valid_until TEXT,

  
  total_amount REAL DEFAULT 0,
  vat_amount REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  final_amount REAL DEFAULT 0,

  
  delivery_method TEXT DEFAULT '배송',
  delivery_time TEXT DEFAULT NULL,
  delivery_info TEXT,
  contact_phone TEXT DEFAULT NULL,
  contact_mobile TEXT DEFAULT NULL,
  shipping_payment TEXT DEFAULT NULL,

  
  notes TEXT,
  internal_notes TEXT,

  
  first_converted_at DATETIME DEFAULT NULL,
  converted_count INTEGER DEFAULT 0,

  
  created_by INTEGER NOT NULL,
  updated_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TABLE quotation_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quotation_id INTEGER NOT NULL,
  item_id INTEGER,
  item_name TEXT NOT NULL,
  width REAL DEFAULT 0,
  height REAL DEFAULT 0,
  scale_factor REAL DEFAULT 1,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'EA',
  unit_price REAL DEFAULT 0,
  amount REAL DEFAULT 0,
  content TEXT,
  post_processing TEXT,
  finishing TEXT,
  pricing_method TEXT DEFAULT 'FIXED',
  parent_id INTEGER DEFAULT NULL,
  sort_order INTEGER DEFAULT 0,
  ai_group_index INTEGER DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1, assigned_entity_id INTEGER,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL
);
CREATE TABLE labor_contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  entity_id INTEGER DEFAULT 1,
  contract_type TEXT NOT NULL DEFAULT 'HOURLY',
  contract_date TEXT,
  contract_start_date TEXT NOT NULL,
  contract_end_date TEXT,
  wage_start_date TEXT,
  wage_end_date TEXT,
  hourly_rate INTEGER DEFAULT 0,
  work_type TEXT DEFAULT 'REGULAR',
  job_description TEXT,
  probation_months INTEGER DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  signature_employee_base64 TEXT,
  signature_employer_base64 TEXT,
  signed_at TEXT,
  signed_ip TEXT,
  pdf_path TEXT,
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
, base_hours_monthly REAL DEFAULT 209, overtime_daily_hours REAL DEFAULT 0, overtime_work_days INTEGER DEFAULT 22, monthly_salary INTEGER DEFAULT 0);
CREATE TABLE caps_sites (
  id TEXT PRIMARY KEY,                          
  name TEXT NOT NULL,                           
  relay_db_host TEXT DEFAULT '',
  relay_db_port INTEGER DEFAULT 3306,
  relay_db_engine TEXT DEFAULT 'access',
  relay_db_name TEXT DEFAULT '',
  relay_db_user TEXT DEFAULT '',
  relay_db_password TEXT DEFAULT '',
  relay_table TEXT DEFAULT 'nOutput',
  sync_enabled INTEGER DEFAULT 0,
  sync_interval_min INTEGER DEFAULT 30,
  sync_lookback_days INTEGER DEFAULT 3,
  worker_endpoint TEXT DEFAULT '',
  worker_api_key TEXT DEFAULT '',
  ignored_fpids TEXT DEFAULT '[]',              
  last_sync_ok_at DATETIME,
  last_unmapped TEXT DEFAULT '[]',              
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "caps_employee_map" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id TEXT NOT NULL DEFAULT 'DJ',
  caps_e_idno TEXT NOT NULL,
  caps_e_name TEXT,
  caps_c_dept TEXT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  is_active INTEGER DEFAULT 1,
  mapped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  mapped_by INTEGER,
  notes TEXT,
  UNIQUE(site_id, caps_e_idno)
);
CREATE TABLE IF NOT EXISTS "shipment_items" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id INTEGER NOT NULL,
  card_id INTEGER,
  order_item_id INTEGER,
  quantity REAL DEFAULT 1,
  notes TEXT,
  FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE,
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE SET NULL,
  FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE SET NULL
);
CREATE TABLE credit_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  client_id INTEGER NOT NULL REFERENCES clients(id),
  credit_limit REAL NOT NULL,
  balance_at_time REAL NOT NULL,
  order_amount REAL NOT NULL,
  approval_request_id INTEGER REFERENCES approval_requests(id),
  status TEXT NOT NULL DEFAULT 'PENDING',  
  approved_by INTEGER REFERENCES users(id),
  approved_at DATETIME,
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
, entity_id INTEGER DEFAULT 1);
CREATE TABLE equipment_oee_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_id TEXT NOT NULL,
  oee_date DATE NOT NULL,
  
  planned_hours REAL NOT NULL DEFAULT 8,
  actual_run_hours REAL DEFAULT 0,
  downtime_planned_min REAL DEFAULT 0,
  downtime_unplanned_min REAL DEFAULT 0,
  availability_pct REAL DEFAULT 0,
  
  theoretical_output_sqm REAL DEFAULT 0,
  actual_output_sqm REAL DEFAULT 0,
  performance_pct REAL DEFAULT 0,
  
  total_produced INTEGER DEFAULT 0,
  good_produced INTEGER DEFAULT 0,
  defect_count INTEGER DEFAULT 0,
  quality_pct REAL DEFAULT 0,
  
  oee_pct REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1,
  UNIQUE(equipment_id, oee_date)
);
CREATE TABLE defect_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  parent_id INTEGER REFERENCES defect_codes(id),
  category TEXT NOT NULL,  
  description TEXT,
  preventive_action TEXT,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
, entity_id INTEGER DEFAULT 1);
CREATE TABLE customer_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_number TEXT NOT NULL UNIQUE,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  client_id INTEGER NOT NULL REFERENCES clients(id),
  claim_date DATE NOT NULL,
  claim_type TEXT NOT NULL DEFAULT 'DEFECT',  
  description TEXT NOT NULL,
  claimed_amount REAL DEFAULT 0,
  resolution_type TEXT,  
  resolved_amount REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'OPEN',  
  quality_issue_id INTEGER REFERENCES quality_issues(id),
  rework_order_id INTEGER REFERENCES orders(id),
  resolved_by INTEGER REFERENCES users(id),
  resolved_at DATETIME,
  entity_id INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_number TEXT NOT NULL UNIQUE,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  client_id INTEGER NOT NULL REFERENCES clients(id),
  claim_id INTEGER REFERENCES customer_claims(id),
  return_date DATE NOT NULL,
  return_reason TEXT NOT NULL,  
  status TEXT NOT NULL DEFAULT 'REQUESTED',
    
  resolution TEXT,  
  refund_amount REAL DEFAULT 0,
  restocking_fee REAL DEFAULT 0,
  notes TEXT,
  entity_id INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE return_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  order_item_id INTEGER NOT NULL REFERENCES order_items(id),
  quantity REAL NOT NULL,
  condition TEXT DEFAULT 'UNKNOWN',  
  disposition TEXT,  
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
, entity_id INTEGER DEFAULT 1);
CREATE TABLE purchase_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT NOT NULL,
  supplier_id INTEGER NOT NULL REFERENCES clients(id),
  po_id INTEGER REFERENCES purchase_orders(id),
  invoice_date DATE NOT NULL,
  due_date DATE,
  subtotal REAL NOT NULL DEFAULT 0,
  vat_amount REAL NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  match_status TEXT DEFAULT 'UNMATCHED',
    
  variance_amount REAL DEFAULT 0,
  payment_status TEXT DEFAULT 'UNPAID',  
  paid_amount REAL DEFAULT 0,
  notes TEXT,
  entity_id INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE purchase_invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  po_item_id INTEGER REFERENCES purchase_order_items(id),
  item_id INTEGER REFERENCES items(id),
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  amount REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
, entity_id INTEGER DEFAULT 1);
CREATE TABLE waste_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER REFERENCES cards(id),
  equipment_id TEXT,
  waste_date DATE NOT NULL,
  waste_type TEXT NOT NULL,    
  waste_reason TEXT NOT NULL,  
  quantity REAL NOT NULL,
  unit TEXT DEFAULT 'SQM',
  estimated_cost REAL DEFAULT 0,
  material_item_id INTEGER REFERENCES items(id),
  notes TEXT,
  recorded_by INTEGER REFERENCES users(id),
  entity_id INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE inventory_fifo_layers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  receipt_date DATE NOT NULL,
  receipt_id INTEGER,
  original_quantity REAL NOT NULL,
  remaining_quantity REAL NOT NULL,
  unit_cost REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
, entity_id INTEGER DEFAULT 1);
CREATE TABLE fixed_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,  
  equipment_id TEXT REFERENCES equipment(id),
  acquisition_date DATE NOT NULL,
  acquisition_cost REAL NOT NULL,
  useful_life_months INTEGER NOT NULL,
  depreciation_method TEXT NOT NULL DEFAULT 'STRAIGHT_LINE',  
  salvage_value REAL DEFAULT 0,
  current_book_value REAL,
  status TEXT NOT NULL DEFAULT 'IN_USE',  
  disposed_at DATE,
  disposal_amount REAL,
  disposal_reason TEXT,
  location TEXT,
  serial_number TEXT,
  entity_id INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE depreciation_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  period TEXT NOT NULL,  
  depreciation_amount REAL NOT NULL,
  accumulated_depreciation REAL NOT NULL,
  book_value REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1,
  UNIQUE(asset_id, period)
);
CREATE TABLE budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fiscal_year INTEGER NOT NULL,
  department TEXT,  
  category TEXT NOT NULL,  
  budget_type TEXT NOT NULL DEFAULT 'EXPENSE',  
  jan REAL DEFAULT 0, feb REAL DEFAULT 0, mar REAL DEFAULT 0,
  apr REAL DEFAULT 0, may REAL DEFAULT 0, jun REAL DEFAULT 0,
  jul REAL DEFAULT 0, aug REAL DEFAULT 0, sep REAL DEFAULT 0,
  oct REAL DEFAULT 0, nov REAL DEFAULT 0, dec REAL DEFAULT 0,
  annual_total REAL DEFAULT 0,
  notes TEXT,
  entity_id INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(fiscal_year, department, category, budget_type, entity_id)
);
CREATE TABLE journal_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES chart_of_accounts(id),
  debit REAL DEFAULT 0,
  credit REAL DEFAULT 0,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "quality_issues" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_record_id INTEGER,
  card_id INTEGER NOT NULL,
  issue_type TEXT NOT NULL DEFAULT 'DEFECT',
  defect_category TEXT DEFAULT 'OTHER',
  quantity_defect INTEGER DEFAULT 1,
  description TEXT NOT NULL,
  root_cause TEXT,
  corrective_action TEXT,
  status TEXT NOT NULL DEFAULT 'REPORTED',
  rework_card_id INTEGER,
  reported_by INTEGER,                        
  reported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_by INTEGER,
  resolved_at DATETIME,
  cost_impact REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  entity_id INTEGER NOT NULL DEFAULT 1,
  defect_code_id INTEGER
, severity TEXT DEFAULT 'MEDIUM');
CREATE TABLE IF NOT EXISTS "vat_reports" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_year INTEGER NOT NULL,
  report_quarter INTEGER NOT NULL CHECK(report_quarter BETWEEN 1 AND 4),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  sales_count INTEGER DEFAULT 0,
  sales_supply_amount REAL DEFAULT 0,
  sales_tax_amount REAL DEFAULT 0,
  purchase_count INTEGER DEFAULT 0,
  purchase_supply_amount REAL DEFAULT 0,
  purchase_tax_amount REAL DEFAULT 0,
  payable_tax REAL DEFAULT 0,
  status TEXT DEFAULT 'DRAFT',
  submitted_at DATETIME,
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  entity_id INTEGER DEFAULT 1,
  UNIQUE(report_year, report_quarter, entity_id)
);
CREATE TABLE expense_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT DEFAULT 'fa-tag',
  color TEXT DEFAULT '#6b7280',
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  entity_id INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE corporate_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_name TEXT NOT NULL,
  card_company TEXT NOT NULL,
  card_number_last4 TEXT,
  holder_name TEXT,
  monthly_limit REAL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  connected_id TEXT,
  entity_id INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
, payment_day INTEGER DEFAULT 15, assigned_user_id INTEGER REFERENCES users(id), cutoff_day INTEGER DEFAULT 15, barobill_registered INTEGER NOT NULL DEFAULT 0, collect_cycle TEXT, barobill_registered_at DATETIME);
CREATE TABLE card_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL REFERENCES corporate_cards(id),
  transaction_date TEXT NOT NULL,
  transaction_time TEXT,
  merchant_name TEXT,
  amount REAL NOT NULL DEFAULT 0,
  installments INTEGER DEFAULT 1,
  category_id INTEGER REFERENCES expense_categories(id),
  memo TEXT,
  receipt_data TEXT,
  status TEXT NOT NULL DEFAULT 'UNCLASSIFIED'
    CHECK(status IN ('UNCLASSIFIED','CLASSIFIED','REQUESTED','APPROVED')),
  payment_request_id INTEGER REFERENCES payment_requests(id),
  codef_transaction_id TEXT,
  entity_id INTEGER DEFAULT 1,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, receipt_image_url TEXT, approval_number TEXT, supply_amount REAL DEFAULT 0, tax_amount REAL DEFAULT 0, approval_type TEXT DEFAULT 'APPROVED', matched_bank_tx_id INTEGER REFERENCES bank_transactions(id), is_offset INTEGER NOT NULL DEFAULT 0, offset_pair_id INTEGER,
  UNIQUE(card_id, codef_transaction_id)
);
CREATE TABLE IF NOT EXISTS "inventory" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  quantity REAL DEFAULT 0,
  safe_stock REAL DEFAULT 0,
  reorder_point REAL DEFAULT 0,
  auto_pr_enabled INTEGER DEFAULT 0,
  storage_zone_id INTEGER REFERENCES storage_zones(id) ON DELETE SET NULL,
  entity_id INTEGER DEFAULT 1 REFERENCES entities(id),
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES items(id)
);
CREATE TABLE IF NOT EXISTS "chart_of_accounts" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK(account_type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
  parent_id INTEGER REFERENCES "chart_of_accounts"(id),
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  entity_id INTEGER NOT NULL DEFAULT 1,
  UNIQUE(code, entity_id)
);
CREATE TABLE expense_auto_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES expense_categories(id),
  match_count INTEGER DEFAULT 0,
  entity_id INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(keyword, entity_id)
);
CREATE TABLE IF NOT EXISTS "journal_entries" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_number TEXT NOT NULL,
  entry_date DATE NOT NULL,
  description TEXT,
  reference_type TEXT,
  reference_id INTEGER,
  is_auto INTEGER DEFAULT 0,
  entity_id INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(entry_number, entity_id)
);
CREATE TABLE order_ai_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT,
  analysis_id INTEGER,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, entity_id INTEGER DEFAULT 1,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (analysis_id) REFERENCES ai_analysis_requests(id)
);
CREATE TABLE price_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE item_group_settings (
  group_name TEXT PRIMARY KEY,
  price_linked INTEGER DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "bank_match_rules" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  counterpart_name TEXT NOT NULL,
  matched_client_id INTEGER,
  matched_category_id INTEGER,
  match_count INTEGER DEFAULT 1,
  last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  entity_id INTEGER DEFAULT 1, match_type TEXT NOT NULL DEFAULT 'EXACT',
  FOREIGN KEY (matched_client_id) REFERENCES clients(id),
  FOREIGN KEY (matched_category_id) REFERENCES expense_categories(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE TABLE certificate_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  certificate_number TEXT NOT NULL,
  certificate_type TEXT NOT NULL DEFAULT 'EMPLOYMENT',
  purpose TEXT,
  issue_date TEXT NOT NULL,
  entity_id INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE ar_provision_rates (
  aging_bucket TEXT PRIMARY KEY,   -- CURRENT | D1_30 | D31_60 | D61_90 | D90_PLUS
  loss_rate REAL NOT NULL,         -- 0.0 ~ 1.0
  sort_order INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE ar_grade_multipliers (
  grade TEXT PRIMARY KEY,          -- A | B | C | D | F | N/A
  multiplier REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS "cards" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_number TEXT UNIQUE NOT NULL,
  order_id INTEGER NOT NULL,
  order_item_id INTEGER,
  status TEXT NOT NULL CHECK(status IN (
    'PRINT_PENDING',
    'RIP_WAITING',
    'PRINTING',
    'PRINT_DONE',
    'HOLD',
    'SHIPPED',
    'PRINT_ERROR'
  )) DEFAULT 'PRINTING',
  client_name TEXT,
  item_name TEXT,
  category_name TEXT,
  width REAL,
  height REAL,
  quantity INTEGER DEFAULT 1,
  unit TEXT DEFAULT 'EA',
  rip_filename TEXT,
  post_processing TEXT,
  final_width REAL,
  final_height REAL,
  delivery_date DATE,
  priority INTEGER DEFAULT 0,
  rip_sent_at DATETIME,
  rip_preview_path TEXT,
  rip_job_path TEXT,
  rip_status TEXT,
  hold_reason TEXT,
  hold_at DATETIME,
  hold_by INTEGER,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  thumbnail_url TEXT DEFAULT NULL,
  printed_quantity INTEGER DEFAULT 0,
  equipment_id TEXT DEFAULT NULL,
  source_file_path TEXT,
  rip_preset TEXT,
  rip_queued_at DATETIME,
  shipped_at DATETIME DEFAULT NULL,
  pp_status TEXT DEFAULT 'N/A',
  pp_completed_at TEXT,
  rip_file_path TEXT,
  requesting_entity_id INTEGER,
  finishing TEXT,
  estimated_minutes REAL,
  queue_position INTEGER,
  estimated_start_at DATETIME,
  estimated_end_at DATETIME,
  waste_sqm REAL DEFAULT 0,
  waste_reason TEXT,
  print_done_at DATETIME,
  shipped_by INTEGER,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
  FOREIGN KEY (hold_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE recurring_expense_actuals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fixed_expense_id INTEGER NOT NULL REFERENCES fixed_expenses(id) ON DELETE CASCADE,
  period TEXT NOT NULL,                       -- YYYY-MM
  estimated_amount REAL,                      -- 예측 시점 추정치
  actual_amount REAL,                         -- 실제 결제 확정치
  actual_source TEXT,                         -- CARD | BANK | MANUAL
  variance REAL,                              -- actual_amount - estimated_amount
  note TEXT,
  entity_id INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(fixed_expense_id, period)
);
CREATE TABLE IF NOT EXISTS "approval_templates" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'GENERAL'
    CHECK(type IN ('PURCHASE_REQUEST','DISCOUNT','BAD_DEBT_WRITEOFF','EQUIPMENT_PURCHASE','EXPENSE_CLAIM','GENERAL','PRICE_CHANGE','LEAVE_ATTENDANCE','SHIPMENT_HOLD','CREDIT_OVERRIDE')),
  description TEXT,
  steps TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER DEFAULT 1,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS "approval_requests" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_number TEXT NOT NULL UNIQUE,
  template_id INTEGER,
  type TEXT NOT NULL DEFAULT 'GENERAL'
    CHECK(type IN ('PURCHASE_REQUEST','DISCOUNT','BAD_DEBT_WRITEOFF','EQUIPMENT_PURCHASE','EXPENSE_CLAIM','GENERAL','PRICE_CHANGE','LEAVE_ATTENDANCE','SHIPMENT_HOLD','CREDIT_OVERRIDE')),
  requester_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  amount REAL DEFAULT 0,
  reference_type TEXT,
  reference_id INTEGER,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK(status IN ('DRAFT','PENDING','IN_REVIEW','APPROVED','REJECTED','CANCELLED')),
  current_step INTEGER DEFAULT 0,
  total_steps INTEGER DEFAULT 0,
  final_comment TEXT,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  entity_id INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (template_id) REFERENCES approval_templates(id),
  FOREIGN KEY (requester_id) REFERENCES users(id)
);
CREATE TABLE order_billing_groups (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id        INTEGER NOT NULL REFERENCES orders(id),
  entity_id       INTEGER NOT NULL,                       -- 청구(=생산 담당) 법인
  billing_status  TEXT,                                   -- NULL | BILLED | PAID (orders에서 이동)
  billed_amount   INTEGER,                                -- 이 법인 몫 청구금액
  supply_amount   INTEGER,                                -- 공급가액 (P3/P4 산정)
  tax_amount      INTEGER,                                -- 세액 (P3/P4 산정)
  billed_at       DATETIME,
  billed_by       INTEGER REFERENCES users(id),
  tax_invoice_id  INTEGER REFERENCES tax_invoices(id),    -- 발행 시 연결 (P4)
  created_at      DATETIME DEFAULT (datetime('now')), accounting_date DATE,
  UNIQUE(order_id, entity_id)
);
CREATE TABLE holidays (
  holiday_date TEXT PRIMARY KEY,        -- 'YYYY-MM-DD'
  name TEXT NOT NULL DEFAULT '공휴일',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE original_archives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER,                     -- 연결 주문
  ai_analysis_id INTEGER,               -- 분석/썸네일 연결
  order_ai_file_id INTEGER,             -- 1:N 파일(order_ai_files, 0254) 연결 (있으면)
  archive_path TEXT NOT NULL,           -- Z:\원본\[카테고리]\YYYY\MM\DD\[주문번호]\[파일명].[ext]
  original_filename TEXT,               -- 고객 제공 원래 파일명 (참조)
  file_ext TEXT,                        -- ai|eps|pdf
  thumbnail_base64 TEXT,                -- 보드 표시용 (groups_json에서 복사 가능)
  status TEXT NOT NULL DEFAULT 'archived' CHECK(status IN ('archived','failed')),
  entity_id INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE sheet_layouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'roll',              -- 'roll'(폭고정·길이가변) | 'flatbed'(고정 W×H)
  canvas_json TEXT NOT NULL,                       -- 시트 규격/모드/여백
  placements_json TEXT NOT NULL DEFAULT '[]',
  item_code TEXT,                                  -- 공통 품목 (D8 동일품목 가드 — P4에서 강화)
  source_analysis_ids TEXT,                        -- 참여 ai_analysis_id 목록(JSON)
  sheet_count INTEGER DEFAULT 1,
  efficiency REAL,                                 -- 자재 효율 0~1
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','rendered','ordered')),
  output_job_id INTEGER,
  entity_id INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT
, render_status TEXT NOT NULL DEFAULT 'none', render_result_json TEXT, render_error TEXT, requeue_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE kakao_template_defaults (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  context TEXT NOT NULL,                       -- shipments / ledger / messages / shell:<related_type>
  match_key TEXT NOT NULL DEFAULT '',          -- 출고 섹션(freight/hanjin/daesintaekbae/quick) 등, 빈값=context 공통
  entity_id INTEGER NOT NULL DEFAULT 1 REFERENCES entities(id),
  template_code TEXT NOT NULL DEFAULT '',
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(context, match_key, entity_id)
);
CREATE TABLE size_grade_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  grade TEXT NOT NULL,             -- 호수: 1호~8호/특호/수기/대형 등
  price REAL NOT NULL DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  UNIQUE(item_id, grade)
);
CREATE TABLE spec_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,           -- 판재두께 / 호수 / 원단폭
  unit TEXT,                           -- T / 호 / mm (표시 보조)
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now'))
);
CREATE TABLE spec_group_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES spec_groups(id) ON DELETE CASCADE,
  value_code TEXT NOT NULL,            -- 5T, 7HO, 4HO1 (품목코드 suffix·하이픈 없음)
  label TEXT NOT NULL,                 -- 5T, 7호, 4-1호 (표시)
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT (datetime('now')),
  UNIQUE(group_id, value_code)
);
CREATE TABLE print_methods (id INTEGER PRIMARY KEY);
CREATE TABLE print_media (id INTEGER PRIMARY KEY);
CREATE TABLE pp_material_deductions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  print_event_id INTEGER NOT NULL,
  order_id INTEGER,
  order_item_id INTEGER,
  pp_option_code TEXT,
  material_item_id INTEGER NOT NULL,
  matched_width_mm INTEGER,
  output_width_mm REAL,
  output_height_mm REAL,
  copy_total INTEGER DEFAULT 1,
  deducted_length_yd REAL NOT NULL,
  inventory_before REAL,
  inventory_after REAL,
  entity_id INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(print_event_id, material_item_id),
  FOREIGN KEY (print_event_id) REFERENCES print_events(id),
  FOREIGN KEY (material_item_id) REFERENCES items(id)
);
CREATE TABLE leave_promotion_notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  entity_id INTEGER NOT NULL DEFAULT 1,
  grant_id INTEGER,                            -- 대상 grant (NULL=연도 일괄)
  fiscal_year INTEGER NOT NULL,               -- 입사일 기준 부여 연도
  source TEXT NOT NULL,                        -- ANNUAL / MONTHLY_A / MONTHLY_B (촉진 트랙)
  stage TEXT NOT NULL,                         -- FIRST / RESPONSE / SECOND
  remaining_days REAL NOT NULL DEFAULT 0,      -- 통지 시점 잔여
  notice_date TEXT NOT NULL,                   -- 발송일 YYYY-MM-DD
  delivered_at TEXT,                           -- 도달일(도달주의 — 면제판정 기준)
  read_at TEXT,                                -- 열람
  designated_use_date TEXT,                    -- 지정 사용일
  channel TEXT,                                -- KAKAO / SMS / EMAIL / PAPER
  message_ref TEXT,                            -- 카톡 접수번호·이메일 id 등
  status TEXT NOT NULL DEFAULT 'SENT',         -- SENT / DELIVERED / ACKED / FAILED
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (grant_id) REFERENCES leave_grants(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE TABLE ia_process_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_id INTEGER NOT NULL,          -- ai_analysis_requests.id (소스 .ai)
  group_index INTEGER NOT NULL,          -- 가공할 그룹/아트보드 인덱스
  params_json TEXT NOT NULL,             -- {target_w_cm,target_h_cm,finishing,trim,rotate90}
  status TEXT NOT NULL DEFAULT 'queued', -- queued|rendering|done|error
  result_json TEXT,                      -- {eps_r2,dxf_r2,jpg_r2,jpg_base64,width_cm,height_cm}
  error_message TEXT,
  entity_id INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
, requeue_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE equipment_processes (
  equipment_id TEXT NOT NULL,
  process_code TEXT NOT NULL,              -- 신모델 분류 코드 (SSOT)
  is_primary   INTEGER NOT NULL DEFAULT 0, -- 대표 공정 1개(배지·필터 기본)
  created_at   TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (equipment_id, process_code)
);
CREATE TABLE user_item_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  item_group TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, item_group)
);
CREATE TABLE shipment_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id INTEGER NOT NULL,
  order_item_id INTEGER NOT NULL,
  packed_quantity REAL,              -- NULL = 전량 (라인 체크 + 예외 시 수량)
  checked_at DATETIME,               -- NULL = 미검수
  checked_by INTEGER,
  UNIQUE(shipment_id, order_item_id),
  FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE,
  FOREIGN KEY (order_item_id) REFERENCES order_items(id),
  FOREIGN KEY (checked_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS "storage_zones" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_name TEXT NOT NULL,
  zone_code TEXT,
  description TEXT,
  manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  entity_id INTEGER DEFAULT 1 REFERENCES entities(id),
  is_default INTEGER DEFAULT 0,
  facility_zone_id INTEGER REFERENCES facility_zones(id) ON DELETE SET NULL,
  bounds TEXT,
  color TEXT DEFAULT '#3B82F6'
);
CREATE TABLE price_sheets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  client_id INTEGER,                 -- 대상 거래처(적용가). NULL=표준 sales_price
  valid_until TEXT,                  -- YYYY-MM-DD
  notes TEXT,                        -- 비고·조건 문구
  contact_person TEXT,               -- 담당자명
  contact_phone TEXT,                -- 담당자 연락처
  show_stamp INTEGER DEFAULT 1,      -- 직인 표시
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE price_sheet_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sheet_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  sort_order INTEGER DEFAULT 0,
  UNIQUE(sheet_id, item_id)
);
CREATE TABLE entity_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id INTEGER NOT NULL,
  department TEXT NOT NULL,   -- 부서명(제작부/영업부 등)
  person_name TEXT,
  phone TEXT,
  fax TEXT,
  sort_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS "role_page_permissions" (
  role TEXT NOT NULL,
  page_key TEXT NOT NULL,
  can_access INTEGER NOT NULL DEFAULT 0,
  can_edit INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER,
  PRIMARY KEY (role, page_key),
  FOREIGN KEY (page_key) REFERENCES permission_pages(page_key) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE departments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  parent_id    INTEGER REFERENCES departments(id),
  dept_type    TEXT    NOT NULL DEFAULT 'SUPPORT' CHECK (dept_type IN ('PRODUCTION','SUPPORT')), -- 매출발생 vs 공통(원가만)
  legacy_codes TEXT,   -- JSON 배열: 구 employees.department 코드(드리프트 브리지/백필 근거)
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))  -- UTC 저장(표시=KST)
, serves_department_id INTEGER REFERENCES departments(id));
CREATE TABLE department_category_map (
  category      TEXT    PRIMARY KEY,   -- items.category 실제 저장값
  department_id INTEGER NOT NULL REFERENCES departments(id)
);
CREATE TABLE designer_intakes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id       INTEGER NOT NULL DEFAULT 1,
  ai_analysis_id  INTEGER REFERENCES ai_analysis_requests(id), -- work.ai 분석 레코드(임포지션 팔레트 호환)
  client_name     TEXT    NOT NULL,                            -- 디자이너 입력(자유 텍스트)
  client_id       INTEGER REFERENCES clients(id),              -- 매칭 성공 시(자동/흡수 시 확정)
  qty             INTEGER NOT NULL DEFAULT 1,
  finishing_json  TEXT,                                        -- per-side JSON {top,bottom,left,right}
  width_cm        REAL,                                        -- 실측(선택 객체 bbox)
  height_cm       REAL,
  scale_pct       INTEGER NOT NULL DEFAULT 100,                -- 저장 %(100/50/25/20/10) → scale_factor=100/pct
  trim            INTEGER NOT NULL DEFAULT 0,                  -- 돔보 여부
  mode            TEXT    NOT NULL DEFAULT 'single' CHECK (mode IN ('single','impose','both')),
  eps_path        TEXT,                                        -- 가공 완료 EPS (Z: 경로)
  work_ai_path    TEXT,                                        -- 정제 work.ai (Z: 경로)
  status          TEXT    NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','absorbed','void')),
  order_item_id   INTEGER REFERENCES order_items(id),          -- 흡수 시 연결
  registered_by   TEXT,                                        -- PC명\사용자 (manifest)
  pc_name         TEXT,
  script_version  TEXT,
  outline_failed  INTEGER NOT NULL DEFAULT 0,                  -- 아웃라인 우아 강등 플래그
  memo            TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),  -- UTC 저장(표시=KST)
  absorbed_at     TEXT
, keyword TEXT, post_desc TEXT, punch_json TEXT, worker_name TEXT, worker_id INTEGER);
CREATE TABLE inter_entity_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_date TEXT NOT NULL,
  from_entity_id INTEGER NOT NULL,
  to_entity_id INTEGER NOT NULL,
  transaction_type TEXT NOT NULL DEFAULT 'SUBROGATION'
    CHECK (transaction_type IN ('SUBROGATION','LOAN','REPAYMENT','INTERNAL_TRADE','INVOICE_TRANSFER','OTHER')),
  amount REAL NOT NULL,
  affects_balance INTEGER NOT NULL DEFAULT 1,
  client_id INTEGER,
  description TEXT,
  from_bank_transaction_id INTEGER,
  to_bank_transaction_id INTEGER,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE payslip_issuance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payroll_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  entity_id INTEGER,
  pay_period TEXT NOT NULL,
  issued_at TEXT,            -- admin 교부(공개) 시각
  issued_by INTEGER,         -- 교부 처리자 user id
  first_viewed_at TEXT,      -- 직원 최초 열람
  last_viewed_at TEXT,       -- 직원 최근 열람
  view_count INTEGER DEFAULT 0,
  viewed_ip TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(payroll_id)
);
CREATE TABLE designer_worker_domains (
  worker_name TEXT PRIMARY KEY,
  domain      TEXT NOT NULL DEFAULT 'output',   -- output|transfer|sign
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
DELETE FROM sqlite_sequence;
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_clients_code ON clients(client_code);
CREATE INDEX idx_clients_name ON clients(client_name);
CREATE INDEX idx_clients_active ON clients(is_active);
CREATE INDEX idx_items_category ON items(category_id);
CREATE INDEX idx_items_code ON items(item_code);
CREATE INDEX idx_items_active ON items(is_active);
CREATE INDEX idx_payments_client_id ON payments(client_id);
CREATE INDEX idx_payments_payment_date ON payments(payment_date);
CREATE INDEX idx_inventory_receipts_date ON inventory_receipts(receipt_date);
CREATE INDEX idx_inventory_releases_date ON inventory_releases(release_date);
CREATE INDEX idx_employees_code ON employees(employee_code);
CREATE INDEX idx_employees_department ON employees(department);
CREATE INDEX idx_employees_status ON employees(status);
CREATE INDEX idx_attendance_employee ON attendance(employee_id);
CREATE INDEX idx_attendance_date ON attendance(work_date);
CREATE INDEX idx_leave_requests_employee ON leave_requests(employee_id);
CREATE INDEX idx_payroll_employee ON payroll(employee_id);
CREATE INDEX idx_payroll_period ON payroll(pay_period);
CREATE INDEX idx_production_logs_date ON production_logs(log_date);
CREATE INDEX idx_production_logs_supervisor ON production_logs(supervisor_id);
CREATE INDEX idx_work_records_log ON work_records(production_log_id);
CREATE INDEX idx_work_records_card ON work_records(card_id);
CREATE INDEX idx_work_records_employee ON work_records(employee_id);
CREATE INDEX idx_work_records_status ON work_records(status);
CREATE INDEX idx_ai_layout_status ON ai_layout_requests(status);
CREATE INDEX idx_ai_layout_analysis_id ON ai_layout_requests(analysis_id);
CREATE INDEX idx_print_events_agent ON print_events(agent_id);
CREATE INDEX idx_print_events_status ON print_events(print_status);
CREATE INDEX idx_print_events_card ON print_events(card_number);
CREATE INDEX idx_print_events_created ON print_events(created_at);
CREATE INDEX idx_print_events_equipment ON print_events(equipment_id);
CREATE INDEX idx_equipment_presets_equipment ON equipment_presets(equipment_id);
CREATE INDEX idx_clients_client_type ON clients(client_type);
CREATE INDEX idx_po_number ON purchase_orders(po_number);
CREATE INDEX idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_po_status ON purchase_orders(status);
CREATE INDEX idx_po_order_date ON purchase_orders(order_date);
CREATE INDEX idx_poi_po ON purchase_order_items(po_id);
CREATE INDEX idx_poi_item ON purchase_order_items(item_id);
CREATE INDEX idx_po_history_po ON po_status_history(po_id);
CREATE INDEX idx_pp_supplier ON purchase_payments(supplier_id);
CREATE INDEX idx_pp_date ON purchase_payments(payment_date);
CREATE INDEX idx_pp_po ON purchase_payments(po_id);
CREATE INDEX idx_cip_client ON client_item_prices(client_id);
CREATE INDEX idx_cip_item ON client_item_prices(item_id);
CREATE INDEX idx_clients_price_list ON clients(price_list_id);
CREATE INDEX idx_pr_request_number ON purchase_requests(request_number);
CREATE INDEX idx_pr_status ON purchase_requests(status);
CREATE INDEX idx_pr_requester ON purchase_requests(requester_id);
CREATE INDEX idx_pri_request ON purchase_request_items(request_id);
CREATE INDEX idx_bt_bank_account ON bank_transactions(bank_account_id);
CREATE INDEX idx_bt_date ON bank_transactions(transaction_date);
CREATE INDEX idx_bt_status ON bank_transactions(match_status);
CREATE INDEX idx_ti_order ON tax_invoices(order_id);
CREATE INDEX idx_ti_status ON tax_invoices(status);
CREATE INDEX idx_ti_issue_date ON tax_invoices(issue_date);
CREATE INDEX idx_ti_nts_approval ON tax_invoices(nts_approval_number);
CREATE INDEX idx_tio_order ON tax_invoice_orders(order_id);
CREATE INDEX idx_card_history_card ON card_status_history(card_id);
CREATE INDEX idx_order_history_order ON order_status_history(order_id);
CREATE INDEX idx_adjustments_client ON adjustments(client_id);
CREATE INDEX idx_adjustments_order ON adjustments(order_id);
CREATE INDEX idx_orders_client_id ON orders(client_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_orders_delivery_date ON orders(delivery_date);
CREATE INDEX idx_orders_priority ON orders(priority);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_item ON order_items(item_id);
CREATE INDEX idx_card_items_card ON card_items(card_id);
CREATE INDEX idx_card_items_order_item ON card_items(order_item_id);
CREATE INDEX idx_equipment_heads_equip ON equipment_heads(equipment_id);
CREATE INDEX idx_maintenance_logs_equip ON maintenance_logs(equipment_id);
CREATE INDEX idx_maintenance_logs_type ON maintenance_logs(log_type);
CREATE INDEX idx_pr_comments_request ON pr_comments(request_id);
CREATE INDEX idx_shipments_order ON shipments(order_id);
CREATE INDEX idx_shipments_status ON shipments(status);
CREATE INDEX idx_shipments_number ON shipments(shipment_number);
CREATE INDEX idx_shipments_shipped ON shipments(shipped_at);
CREATE INDEX idx_po_templates_supplier ON po_templates(supplier_id);
CREATE INDEX idx_po_templates_active ON po_templates(is_active);
CREATE INDEX idx_po_template_items_template ON po_template_items(template_id);
CREATE INDEX idx_collection_logs_client_id ON collection_logs(client_id);
CREATE INDEX idx_collection_logs_contact_date ON collection_logs(contact_date);
CREATE INDEX idx_client_notes_client ON client_notes(client_id);
CREATE INDEX idx_client_notes_date ON client_notes(created_at);
CREATE INDEX idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_created ON activity_logs(created_at DESC);
CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_role ON notifications(target_role, is_read, created_at DESC);
CREATE INDEX idx_equipment_consumables_equip ON equipment_consumables(equipment_id);
CREATE INDEX idx_equipment_consumables_due ON equipment_consumables(next_due_at);
CREATE INDEX idx_maintenance_schedules_equip ON maintenance_schedules(equipment_id);
CREATE INDEX idx_maintenance_schedules_due ON maintenance_schedules(next_due_at);
CREATE INDEX idx_payments_client_date ON payments(client_id, payment_date);
CREATE INDEX idx_adjustments_client_date ON adjustments(client_id, created_at);
CREATE INDEX idx_notifications_role_read ON notifications(target_role, is_read);
CREATE INDEX idx_orders_created ON orders(created_at);
CREATE INDEX idx_email_logs_template ON email_logs(template);
CREATE INDEX idx_email_logs_related ON email_logs(related_type, related_id);
CREATE INDEX idx_email_logs_created ON email_logs(created_at);
CREATE INDEX idx_collection_logs_client ON collection_logs(client_id);
CREATE INDEX idx_collection_logs_date ON collection_logs(contact_date);
CREATE INDEX idx_fe_category ON fixed_expenses(category);
CREATE INDEX idx_fe_active ON fixed_expenses(is_active);
CREATE INDEX idx_loans_active ON loans(is_active);
CREATE INDEX idx_lp_loan ON loan_payments(loan_id);
CREATE INDEX idx_lp_date ON loan_payments(scheduled_date);
CREATE INDEX idx_lp_status ON loan_payments(status);
CREATE INDEX idx_lrh_loan ON loan_rate_history(loan_id);
CREATE INDEX idx_il_zone ON inventory_locations(zone_id);
CREATE INDEX idx_bom_item ON bom_items(item_id);
CREATE INDEX idx_bom_category ON bom_items(category_name);
CREATE INDEX idx_bom_material ON bom_items(material_item_id);
CREATE INDEX idx_bom_active ON bom_items(is_active);
CREATE INDEX idx_mrp_runs_number ON mrp_runs(run_number);
CREATE INDEX idx_mrp_runs_type ON mrp_runs(run_type);
CREATE INDEX idx_mrp_results_run ON mrp_results(run_id);
CREATE INDEX idx_mrp_results_material ON mrp_results(material_item_id);
CREATE INDEX idx_as_request ON approval_steps(request_id);
CREATE INDEX idx_as_approver ON approval_steps(approver_id);
CREATE INDEX idx_as_role ON approval_steps(approver_role);
CREATE INDEX idx_aa_request ON approval_attachments(request_id);
CREATE INDEX idx_ca_client ON client_accounts(client_id);
CREATE INDEX idx_ca_login ON client_accounts(login_id);
CREATE INDEX idx_pal_account ON portal_access_logs(client_account_id);
CREATE INDEX idx_prr_client ON portal_reorder_requests(client_id);
CREATE INDEX idx_prr_status ON portal_reorder_requests(status);
CREATE INDEX idx_file_map_order ON print_file_map(order_number);
CREATE INDEX idx_file_map_filename ON print_file_map(file_name);
CREATE INDEX idx_order_items_parent ON order_items(parent_item_id);
CREATE INDEX idx_purchase_adjustments_supplier ON purchase_adjustments(supplier_id);
CREATE INDEX idx_cash_receipts_status ON cash_receipts(status);
CREATE INDEX idx_cash_receipts_client ON cash_receipts(client_id);
CREATE INDEX idx_cash_receipts_trade_date ON cash_receipts(trade_date);
CREATE INDEX idx_cash_receipts_receipt_number ON cash_receipts(receipt_number);
CREATE INDEX idx_hometax_jobs_state ON hometax_jobs(state);
CREATE INDEX idx_hometax_jobs_type ON hometax_jobs(job_type);
CREATE INDEX idx_hometax_invoices_type ON hometax_invoices(invoice_type);
CREATE INDEX idx_hometax_invoices_nts ON hometax_invoices(nts_confirm_number);
CREATE INDEX idx_hometax_invoices_match ON hometax_invoices(match_status);
CREATE INDEX idx_hometax_invoices_issue_date ON hometax_invoices(issue_date);
CREATE INDEX idx_hometax_invoices_issuer ON hometax_invoices(issuer_corp_num);
CREATE INDEX idx_hometax_invoices_receiver ON hometax_invoices(receiver_corp_num);
CREATE INDEX idx_product_materials_product ON product_materials(product_item_id);
CREATE INDEX idx_product_materials_material ON product_materials(material_item_id);
CREATE INDEX idx_auto_deductions_print_event ON inventory_auto_deductions(print_event_id);
CREATE INDEX idx_auto_deductions_material ON inventory_auto_deductions(material_item_id);
CREATE INDEX idx_auto_deductions_created ON inventory_auto_deductions(created_at);
CREATE INDEX idx_count_items_count ON inventory_count_items(count_id);
CREATE INDEX idx_count_items_item ON inventory_count_items(item_id);
CREATE INDEX idx_cost_snapshots_period ON cost_snapshots(period);
CREATE INDEX idx_auto_process_jobs_status ON auto_process_jobs(status);
CREATE INDEX idx_auto_process_jobs_order ON auto_process_jobs(order_id);
CREATE INDEX idx_auto_process_jobs_order_item ON auto_process_jobs(order_item_id);
CREATE INDEX idx_items_item_group ON items(item_group);
CREATE INDEX idx_items_item_type ON items(item_type);
CREATE INDEX idx_orders_billing_status ON orders(billing_status);
CREATE INDEX idx_tax_invoices_order_id ON tax_invoices(order_id);
CREATE INDEX idx_tax_invoice_orders_order_id ON tax_invoice_orders(order_id);
CREATE INDEX idx_items_storage_zone ON items(storage_zone_id);
CREATE INDEX idx_stock_alerts_status ON stock_alerts(status);
CREATE INDEX idx_stock_alerts_item ON stock_alerts(item_id);
CREATE INDEX idx_inspection_template_items_template ON inspection_template_items(template_id);
CREATE INDEX idx_inspection_results_receipt ON inspection_results(receipt_id);
CREATE INDEX idx_inspection_result_items_result ON inspection_result_items(result_id);
CREATE INDEX idx_clients_billing_group ON clients(billing_group_id);
CREATE INDEX idx_clients_credit_hold ON clients(credit_hold);
CREATE INDEX idx_kakao_send_logs_client ON kakao_send_logs(client_id);
CREATE INDEX idx_kakao_send_logs_related ON kakao_send_logs(related_type, related_id);
CREATE INDEX idx_kakao_send_logs_status ON kakao_send_logs(status);
CREATE INDEX idx_kakao_send_logs_created ON kakao_send_logs(created_at);
CREATE INDEX idx_cash_schedule_date ON cash_schedule(schedule_date);
CREATE INDEX idx_cash_schedule_status ON cash_schedule(status);
CREATE INDEX idx_cash_schedule_source ON cash_schedule(source_type, source_id);
CREATE INDEX idx_cash_schedule_flow ON cash_schedule(flow_type, schedule_date);
CREATE INDEX idx_payment_requests_status ON payment_requests(status);
CREATE INDEX idx_payment_requests_date ON payment_requests(request_date);
CREATE INDEX idx_payment_requests_po ON payment_requests(related_po_id);
CREATE INDEX idx_employees_caps_code ON employees(caps_employee_code);
CREATE INDEX idx_leave_balances_employee ON leave_balances(employee_id);
CREATE INDEX idx_leave_balances_year ON leave_balances(year);
CREATE INDEX idx_leave_accrual_logs_employee ON leave_accrual_logs(employee_id);
CREATE INDEX idx_leave_accrual_logs_year ON leave_accrual_logs(year);
CREATE INDEX idx_insurance_rates_year ON insurance_rates(year);
CREATE INDEX idx_income_tax_table_lookup ON income_tax_table(year, monthly_pay_min);
CREATE INDEX idx_attendance_caps_fpid ON attendance(caps_fpid);
CREATE INDEX idx_attendance_source ON attendance(source);
CREATE INDEX idx_caps_sync_log_started_at ON caps_sync_log(started_at DESC);
CREATE INDEX idx_caps_sync_log_status ON caps_sync_log(status);
CREATE INDEX idx_year_end_settlements_emp_year ON year_end_settlements(employee_id, year);
CREATE INDEX idx_year_end_deduction_items_sid ON year_end_deduction_items(settlement_id);
CREATE INDEX idx_insurance_reports_ym ON insurance_reports(year, month);
CREATE INDEX idx_insurance_report_details_rid ON insurance_report_details(report_id);
CREATE UNIQUE INDEX idx_auto_deductions_print_event_unique
  ON inventory_auto_deductions(print_event_id);
CREATE INDEX idx_tasks_status_type ON tasks(status, type);
CREATE INDEX idx_tasks_order ON tasks(order_id);
CREATE INDEX idx_tasks_card ON tasks(card_id);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);
CREATE INDEX idx_inventory_transactions_item ON inventory_transactions(item_id);
CREATE INDEX idx_inventory_transactions_date ON inventory_transactions(transaction_date);
CREATE INDEX idx_po_items_zone_status ON purchase_order_items(storage_zone_id, line_status);
CREATE INDEX idx_po_items_po_id ON purchase_order_items(po_id);
CREATE INDEX idx_portal_tokens_token ON portal_access_tokens(token);
CREATE INDEX idx_portal_tokens_expires ON portal_access_tokens(expires_at);
CREATE INDEX idx_ksl_channel ON kakao_send_logs(channel);
CREATE INDEX idx_orders_entity ON orders(entity_id);
CREATE INDEX idx_payments_entity ON payments(entity_id);
CREATE INDEX idx_tax_invoices_entity ON tax_invoices(entity_id);
CREATE INDEX idx_purchase_orders_entity ON purchase_orders(entity_id);
CREATE INDEX idx_payroll_entity ON payroll(entity_id);
CREATE INDEX idx_order_items_shipment_ready ON order_items(shipment_ready);
CREATE INDEX idx_items_parent_media ON items(parent_media_id);
CREATE INDEX idx_items_code_prefix ON items(code_prefix);
CREATE INDEX idx_price_history_target
ON price_change_history(target_type, target_id);
CREATE INDEX idx_orders_billable_after ON orders(billable_after);
CREATE INDEX idx_orders_order_type ON orders(order_type);
CREATE INDEX idx_orders_auto_complete ON orders(auto_complete_date)
  WHERE auto_complete_date IS NOT NULL AND status = 'PRINT_DONE';
CREATE UNIQUE INDEX idx_client_price_rates_unique ON client_price_rates(client_id, COALESCE(category, '__ALL__'));
CREATE INDEX idx_client_price_rates_client ON client_price_rates(client_id);
CREATE INDEX idx_policy_rules_policy ON price_policy_rules(policy_id);
CREATE INDEX idx_policy_rules_item ON price_policy_rules(item_id);
CREATE INDEX idx_items_category_text ON items(category);
CREATE INDEX idx_order_items_category_name ON order_items(category_name);
CREATE INDEX idx_quotations_client_id ON quotations(client_id);
CREATE INDEX idx_quotations_status ON quotations(status);
CREATE INDEX idx_quotations_valid_until ON quotations(valid_until);
CREATE INDEX idx_quotations_quotation_date ON quotations(quotation_date);
CREATE INDEX idx_quotations_entity_id ON quotations(entity_id);
CREATE INDEX idx_quotation_items_quotation_id ON quotation_items(quotation_id);
CREATE INDEX idx_quotation_items_item_id ON quotation_items(item_id);
CREATE INDEX idx_orders_quotation_id ON orders(quotation_id);
CREATE INDEX idx_inventory_counts_entity ON inventory_counts(entity_id);
CREATE INDEX idx_hometax_invoices_entity ON hometax_invoices(entity_id);
CREATE INDEX idx_shipments_entity ON shipments(entity_id);
CREATE INDEX idx_production_logs_entity ON production_logs(entity_id);
CREATE INDEX idx_work_records_entity ON work_records(entity_id);
CREATE INDEX idx_labor_contracts_employee ON labor_contracts(employee_id);
CREATE INDEX idx_labor_contracts_entity ON labor_contracts(entity_id);
CREATE INDEX idx_labor_contracts_status ON labor_contracts(status);
CREATE INDEX idx_caps_emp_map_site_idno ON caps_employee_map(site_id, caps_e_idno);
CREATE INDEX idx_caps_emp_map_employee ON caps_employee_map(employee_id);
CREATE INDEX idx_tax_invoice_items_invoice ON tax_invoice_items(tax_invoice_id);
CREATE INDEX idx_tax_invoice_orders_invoice ON tax_invoice_orders(tax_invoice_id);
CREATE UNIQUE INDEX idx_employees_caps_site_caps_id
  ON employees(caps_site_id, caps_id)
  WHERE caps_id IS NOT NULL AND caps_id != '';
CREATE INDEX idx_bank_accounts_entity_id ON bank_accounts(entity_id);
CREATE INDEX idx_bank_transactions_entity_id ON bank_transactions(entity_id);
CREATE INDEX idx_cash_receipts_entity_id ON cash_receipts(entity_id);
CREATE INDEX idx_orders_entity_status ON orders(entity_id, status);
CREATE INDEX idx_orders_entity_created ON orders(entity_id, created_at DESC);
CREATE INDEX idx_shipment_items_shipment ON shipment_items(shipment_id);
CREATE INDEX idx_shipment_items_card_id ON shipment_items(card_id);
CREATE INDEX idx_shipment_items_order_item_id ON shipment_items(order_item_id);
CREATE UNIQUE INDEX idx_shipment_items_unique_card
  ON shipment_items(shipment_id, card_id)
  WHERE card_id IS NOT NULL;
CREATE INDEX idx_credit_overrides_order ON credit_overrides(order_id);
CREATE INDEX idx_credit_overrides_client ON credit_overrides(client_id);
CREATE INDEX idx_oee_equipment ON equipment_oee_daily(equipment_id);
CREATE INDEX idx_oee_date ON equipment_oee_daily(oee_date);
CREATE INDEX idx_defect_codes_parent ON defect_codes(parent_id);
CREATE INDEX idx_defect_codes_category ON defect_codes(category);
CREATE INDEX idx_claims_client ON customer_claims(client_id);
CREATE INDEX idx_claims_order ON customer_claims(order_id);
CREATE INDEX idx_claims_status ON customer_claims(status);
CREATE INDEX idx_claims_entity ON customer_claims(entity_id);
CREATE INDEX idx_returns_client ON returns(client_id);
CREATE INDEX idx_returns_order ON returns(order_id);
CREATE INDEX idx_returns_status ON returns(status);
CREATE INDEX idx_return_items_return ON return_items(return_id);
CREATE INDEX idx_pi_supplier ON purchase_invoices(supplier_id);
CREATE INDEX idx_pi_po ON purchase_invoices(po_id);
CREATE INDEX idx_pi_status ON purchase_invoices(match_status);
CREATE INDEX idx_pii_invoice ON purchase_invoice_items(invoice_id);
CREATE INDEX idx_waste_date ON waste_records(waste_date);
CREATE INDEX idx_waste_equipment ON waste_records(equipment_id);
CREATE INDEX idx_waste_card ON waste_records(card_id);
CREATE INDEX idx_waste_reason ON waste_records(waste_reason);
CREATE INDEX idx_fifo_item ON inventory_fifo_layers(item_id, remaining_quantity);
CREATE INDEX idx_fifo_receipt ON inventory_fifo_layers(receipt_date);
CREATE INDEX idx_fa_category ON fixed_assets(category);
CREATE INDEX idx_fa_status ON fixed_assets(status);
CREATE INDEX idx_fa_equipment ON fixed_assets(equipment_id);
CREATE INDEX idx_depr_asset ON depreciation_records(asset_id);
CREATE INDEX idx_depr_period ON depreciation_records(period);
CREATE INDEX idx_budgets_year ON budgets(fiscal_year);
CREATE INDEX idx_budgets_dept ON budgets(department);
CREATE INDEX idx_jl_entry ON journal_lines(entry_id);
CREATE INDEX idx_jl_account ON journal_lines(account_id);
CREATE INDEX idx_qi_card ON quality_issues(card_id);
CREATE INDEX idx_qi_status ON quality_issues(status);
CREATE INDEX idx_qi_entity ON quality_issues(entity_id);
CREATE INDEX idx_qi_defect_code ON quality_issues(defect_code_id);
CREATE INDEX idx_equipment_oee_daily_entity ON equipment_oee_daily(entity_id);
CREATE INDEX idx_defect_codes_entity ON defect_codes(entity_id);
CREATE INDEX idx_inventory_fifo_layers_entity ON inventory_fifo_layers(entity_id);
CREATE INDEX idx_credit_overrides_entity ON credit_overrides(entity_id);
CREATE INDEX idx_bank_tx_matched_payment ON bank_transactions(matched_payment_id);
CREATE INDEX idx_print_events_card_id ON print_events(card_id);
CREATE INDEX idx_caps_emp_map_site ON caps_employee_map(site_id);
CREATE INDEX idx_vat_reports_entity ON vat_reports(entity_id);
CREATE INDEX idx_fixed_expenses_entity ON fixed_expenses(entity_id);
CREATE INDEX idx_loans_entity ON loans(entity_id);
CREATE INDEX idx_corporate_cards_entity ON corporate_cards(entity_id);
CREATE INDEX idx_card_tx_card ON card_transactions(card_id);
CREATE INDEX idx_card_tx_date ON card_transactions(transaction_date);
CREATE INDEX idx_card_tx_status ON card_transactions(status);
CREATE INDEX idx_card_tx_entity ON card_transactions(entity_id);
CREATE INDEX idx_card_tx_category ON card_transactions(category_id);
CREATE INDEX idx_inventory_entity ON inventory(entity_id);
CREATE INDEX idx_inventory_zone ON inventory(storage_zone_id);
CREATE INDEX idx_inv_receipts_entity ON inventory_receipts(entity_id);
CREATE INDEX idx_inv_releases_entity ON inventory_releases(entity_id);
CREATE INDEX idx_inv_adjustments_entity ON inventory_adjustments(entity_id);
CREATE INDEX idx_purchase_requests_entity ON purchase_requests(entity_id);
CREATE UNIQUE INDEX idx_pi_unique_supplier_invoice
  ON purchase_invoices(supplier_id, invoice_number, entity_id);
CREATE INDEX idx_depr_entity ON depreciation_records(entity_id);
CREATE INDEX idx_as_entity ON approval_steps(entity_id);
CREATE INDEX idx_aa_entity ON approval_attachments(entity_id);
CREATE INDEX idx_stock_alerts_entity ON stock_alerts(entity_id);
CREATE INDEX idx_tasks_entity ON tasks(entity_id);
CREATE INDEX idx_ec_entity ON equipment_consumables(entity_id);
CREATE INDEX idx_ms_entity ON maintenance_schedules(entity_id);
CREATE INDEX idx_pii_entity ON purchase_invoice_items(entity_id);
CREATE INDEX idx_ri_entity ON return_items(entity_id);
CREATE INDEX idx_coa_entity ON chart_of_accounts(entity_id);
CREATE INDEX idx_coa_parent ON chart_of_accounts(parent_id);
CREATE INDEX idx_attendance_entity_id ON attendance(entity_id);
CREATE INDEX idx_pri_entity ON purchase_request_items(entity_id);
CREATE INDEX idx_je_date ON journal_entries(entry_date);
CREATE INDEX idx_je_ref ON journal_entries(reference_type, reference_id);
CREATE INDEX idx_je_entity ON journal_entries(entity_id);
CREATE UNIQUE INDEX idx_ti_number_entity
  ON tax_invoices(invoice_number, entity_id);
CREATE INDEX idx_cash_schedule_entity ON cash_schedule(entity_id);
CREATE INDEX idx_mrp_runs_entity ON mrp_runs(entity_id);
CREATE INDEX idx_iri_receipt ON inventory_receipt_items(receipt_id);
CREATE INDEX idx_iri_item ON inventory_receipt_items(item_id);
CREATE INDEX idx_employees_user ON employees(user_id);
CREATE UNIQUE INDEX idx_corporate_cards_number_entity
  ON corporate_cards(card_number_last4, entity_id);
CREATE INDEX idx_purchase_adjustments_entity ON purchase_adjustments(entity_id);
CREATE INDEX idx_order_ai_files_order ON order_ai_files(order_id);
CREATE INDEX idx_order_ai_files_entity ON order_ai_files(entity_id);
CREATE INDEX idx_ai_analysis_requests_entity ON ai_analysis_requests(entity_id);
CREATE INDEX idx_quotation_items_entity ON quotation_items(entity_id);
CREATE INDEX idx_kakao_send_logs_entity ON kakao_send_logs(entity_id);
CREATE INDEX idx_auto_process_jobs_entity ON auto_process_jobs(entity_id);
CREATE INDEX idx_billing_groups_entity ON billing_groups(entity_id);
CREATE INDEX idx_loan_rate_history_entity ON loan_rate_history(entity_id);
CREATE INDEX idx_loan_payments_entity ON loan_payments(entity_id);
CREATE INDEX idx_price_lists_entity ON price_lists(entity_id);
CREATE INDEX idx_insurance_reports_entity ON insurance_reports(entity_id);
CREATE INDEX idx_orders_entity_number ON orders(entity_id, order_number);
CREATE INDEX idx_employees_is_deleted ON employees(is_deleted);
CREATE INDEX idx_print_events_entity ON print_events(entity_id);
CREATE INDEX idx_cost_snapshots_entity ON cost_snapshots(entity_id);
CREATE INDEX idx_inv_auto_deductions_entity ON inventory_auto_deductions(entity_id);
CREATE INDEX idx_price_policies_entity ON price_policies(entity_id);
CREATE INDEX idx_notifications_entity ON notifications(entity_id);
CREATE INDEX idx_year_end_settlements_entity ON year_end_settlements(entity_id);
CREATE INDEX idx_leave_balances_entity ON leave_balances(entity_id);
CREATE INDEX idx_leave_requests_entity ON leave_requests(entity_id);
CREATE INDEX idx_inspection_results_entity ON inspection_results(entity_id);
CREATE INDEX idx_portal_access_tokens_entity ON portal_access_tokens(entity_id);
CREATE INDEX idx_portal_reorder_requests_entity ON portal_reorder_requests(entity_id);
CREATE INDEX idx_collection_logs_entity ON collection_logs(entity_id);
CREATE INDEX idx_client_notes_entity ON client_notes(entity_id);
CREATE INDEX idx_client_accounts_entity ON client_accounts(entity_id);
CREATE UNIQUE INDEX idx_users_email_unique ON users(email) WHERE email IS NOT NULL AND email != '';
CREATE UNIQUE INDEX idx_payment_requests_entity_request_number
  ON payment_requests(entity_id, request_number);
CREATE INDEX idx_items_price_group ON items(price_group_id);
CREATE INDEX idx_leave_accrual_logs_entity ON leave_accrual_logs(entity_id);
CREATE INDEX idx_bank_tx_category ON bank_transactions(matched_category_id);
CREATE UNIQUE INDEX idx_bank_match_rules_entity_name
  ON bank_match_rules(entity_id, counterpart_name);
CREATE UNIQUE INDEX idx_orders_entity_order_number
  ON orders(entity_id, order_number);
CREATE INDEX idx_pch_entity ON price_change_history(entity_id);
CREATE UNIQUE INDEX idx_cert_logs_entity_number ON certificate_logs(entity_id, certificate_number);
CREATE INDEX idx_cert_logs_entity_date ON certificate_logs(entity_id, issue_date);
CREATE UNIQUE INDEX idx_leave_requests_active
  ON leave_requests(employee_id, leave_type, start_date, end_date)
  WHERE status IN ('PENDING', 'APPROVED');
CREATE INDEX idx_order_items_ai_analysis_id ON order_items(ai_analysis_id);
CREATE INDEX idx_tax_invoices_buyer_client_id ON tax_invoices(buyer_client_id);
CREATE INDEX idx_email_logs_entity ON email_logs(entity_id);
CREATE INDEX idx_print_file_map_entity ON print_file_map(entity_id);
CREATE UNIQUE INDEX idx_print_file_map_entity_order_seq
  ON print_file_map(entity_id, order_number, file_seq);
CREATE UNIQUE INDEX idx_leave_accrual_no_dup
  ON leave_accrual_logs(employee_id, year, accrual_type, entity_id)
  WHERE accrual_type = 'YEARLY';
CREATE UNIQUE INDEX idx_po_entity_number
  ON purchase_orders(entity_id, po_number);
CREATE UNIQUE INDEX idx_quotation_entity_number
  ON quotations(entity_id, quotation_number);
CREATE UNIQUE INDEX idx_hometax_nts_uniq
  ON hometax_invoices(entity_id, nts_confirm_number);
CREATE UNIQUE INDEX idx_tax_invoices_nts_uniq
  ON tax_invoices(entity_id, nts_approval_number)
  WHERE nts_approval_number IS NOT NULL;
CREATE UNIQUE INDEX idx_cash_receipts_nts_uniq
  ON cash_receipts(entity_id, nts_approval_number)
  WHERE nts_approval_number IS NOT NULL;
CREATE INDEX idx_order_items_assigned_entity
  ON order_items(assigned_entity_id) WHERE assigned_entity_id IS NOT NULL;
CREATE UNIQUE INDEX idx_inventory_tx_unique_ref
  ON inventory_transactions(reference_type, reference_id, item_id, transaction_type, entity_id)
  WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL;
CREATE INDEX idx_cards_card_number ON cards(card_number);
CREATE INDEX idx_cards_order_id ON cards(order_id);
CREATE INDEX idx_cards_status ON cards(status);
CREATE INDEX idx_cards_category_name ON cards(category_name);
CREATE INDEX idx_cards_delivery_date ON cards(delivery_date);
CREATE INDEX idx_cards_priority ON cards(priority DESC);
CREATE INDEX idx_cards_pp_status ON cards(pp_status);
CREATE INDEX idx_cards_requesting_entity_id ON cards(requesting_entity_id);
CREATE INDEX idx_cards_entity_status ON cards(requesting_entity_id, status);
CREATE INDEX idx_cards_entity_number ON cards(requesting_entity_id, card_number);
CREATE UNIQUE INDEX idx_cards_entity_card_number ON cards(requesting_entity_id, card_number);
CREATE INDEX idx_cards_order_item_id ON cards(order_item_id);
CREATE INDEX idx_fe_amount_type ON fixed_expenses(amount_type);
CREATE INDEX idx_rea_fe ON recurring_expense_actuals(fixed_expense_id);
CREATE INDEX idx_rea_period ON recurring_expense_actuals(period);
CREATE INDEX idx_rea_entity ON recurring_expense_actuals(entity_id);
CREATE INDEX idx_ar_requester ON approval_requests(requester_id);
CREATE INDEX idx_ar_status ON approval_requests(status);
CREATE INDEX idx_ar_type ON approval_requests(type);
CREATE INDEX idx_ar_number ON approval_requests(request_number);
CREATE INDEX idx_ar_entity ON approval_requests(entity_id);
CREATE INDEX idx_at_type ON approval_templates(type);
CREATE INDEX idx_equipment_entity ON equipment(entity_id);
CREATE INDEX idx_cards_status_priority_delivery
  ON cards(status, priority DESC, delivery_date ASC, created_at ASC);
CREATE INDEX idx_obg_order  ON order_billing_groups(order_id);
CREATE INDEX idx_obg_entity ON order_billing_groups(entity_id);
CREATE INDEX idx_obg_status ON order_billing_groups(billing_status);
CREATE INDEX idx_obg_tax_invoice ON order_billing_groups(tax_invoice_id);
CREATE INDEX idx_original_archives_order ON original_archives(order_id);
CREATE INDEX idx_original_archives_analysis ON original_archives(ai_analysis_id);
CREATE INDEX idx_original_archives_entity ON original_archives(entity_id);
CREATE INDEX idx_sheet_layouts_entity ON sheet_layouts(entity_id);
CREATE INDEX idx_sheet_layouts_status ON sheet_layouts(status);
CREATE INDEX idx_sheet_layouts_render ON sheet_layouts(render_status);
CREATE INDEX idx_items_pricing_profile ON items(pricing_profile);
CREATE INDEX idx_size_grade_item ON size_grade_prices(item_id);
CREATE INDEX idx_spec_group_values_group ON spec_group_values(group_id);
CREATE INDEX idx_items_spec_group ON items(spec_group_id);
CREATE INDEX idx_items_ecount_code ON items(ecount_code);
CREATE INDEX idx_items_spec_group2 ON items(spec_group_id2);
CREATE INDEX idx_card_tx_offset ON card_transactions(is_offset);
CREATE INDEX idx_promo_emp ON leave_promotion_notices(employee_id, fiscal_year);
CREATE INDEX idx_promo_entity ON leave_promotion_notices(entity_id);
CREATE UNIQUE INDEX idx_promo_unique
  ON leave_promotion_notices(employee_id, fiscal_year, source, stage, COALESCE(grant_id, 0));
CREATE INDEX idx_ia_process_jobs_status ON ia_process_jobs(status);
CREATE INDEX idx_payments_tax_invoice ON payments(tax_invoice_id);
CREATE INDEX idx_eqproc_equipment ON equipment_processes(equipment_id);
CREATE INDEX idx_eqproc_process ON equipment_processes(process_code);
CREATE INDEX idx_inventory_counts_storage_zone ON inventory_counts(storage_zone_id);
CREATE UNIQUE INDEX idx_inventory_item_entity_zone
  ON inventory(item_id, entity_id, IFNULL(storage_zone_id, 0));
CREATE UNIQUE INDEX idx_count_items_unique_zone
  ON inventory_count_items(count_id, item_id, IFNULL(storage_zone_id, 0));
CREATE INDEX idx_obg_accounting_date ON order_billing_groups(accounting_date);
CREATE INDEX idx_user_item_access_user ON user_item_access(user_id);
CREATE INDEX idx_shipments_merged_into ON shipments(merged_into_id);
CREATE INDEX idx_shipment_checks_shipment ON shipment_checks(shipment_id);
CREATE INDEX idx_inventory_transactions_entity_item ON inventory_transactions(entity_id, item_id);
CREATE INDEX idx_print_events_started ON print_events(print_started_at);
CREATE INDEX idx_orders_consolidate_with ON orders(consolidate_with_order_id);
CREATE INDEX idx_storage_zones_active ON storage_zones(is_active);
CREATE INDEX idx_storage_zones_manager ON storage_zones(manager_id);
CREATE UNIQUE INDEX idx_sz_entity_name ON storage_zones(entity_id, zone_name);
CREATE UNIQUE INDEX idx_sz_entity_code ON storage_zones(entity_id, zone_code) WHERE zone_code IS NOT NULL;
CREATE UNIQUE INDEX idx_bt_content ON bank_transactions(content_key);
CREATE INDEX idx_bt_codef_ref ON bank_transactions(bank_account_id, codef_transaction_id);
CREATE INDEX idx_price_sheet_items_sheet ON price_sheet_items(sheet_id);
CREATE INDEX idx_price_sheets_entity ON price_sheets(entity_id);
CREATE INDEX idx_entity_contacts_entity ON entity_contacts(entity_id);
CREATE INDEX idx_rpp_role_access ON role_page_permissions(role, can_access);
CREATE INDEX idx_rpp_role_edit ON role_page_permissions(role, can_edit);
CREATE INDEX idx_bt_fixed ON bank_transactions(matched_fixed_expense_id);
CREATE INDEX idx_bt_transfer ON bank_transactions(transfer_pair_id);
CREATE INDEX idx_activity_logs_actor_entity ON activity_logs(actor_entity_id, created_at DESC);
CREATE INDEX idx_departments_parent ON departments(parent_id);
CREATE INDEX idx_employees_department_id ON employees(department_id);
CREATE INDEX idx_designer_intakes_status ON designer_intakes(entity_id, status);
CREATE INDEX idx_designer_intakes_client ON designer_intakes(client_name);
CREATE INDEX idx_designer_intakes_analysis ON designer_intakes(ai_analysis_id);
CREATE INDEX idx_bt_matched_pp ON bank_transactions(matched_purchase_payment_id);
CREATE INDEX idx_iet_from_entity ON inter_entity_transactions(from_entity_id);
CREATE INDEX idx_iet_to_entity ON inter_entity_transactions(to_entity_id);
CREATE INDEX idx_iet_date ON inter_entity_transactions(transaction_date);
CREATE INDEX idx_payslip_issuance_period ON payslip_issuance_logs(pay_period);
CREATE INDEX idx_payslip_issuance_emp ON payslip_issuance_logs(employee_id);
CREATE UNIQUE INDEX idx_bt_matched_pp_uniq ON bank_transactions(matched_purchase_payment_id) WHERE matched_purchase_payment_id IS NOT NULL;
CREATE UNIQUE INDEX idx_bt_matched_payment_uniq ON bank_transactions(matched_payment_id) WHERE matched_payment_id IS NOT NULL;
CREATE INDEX idx_designer_intakes_worker ON designer_intakes(worker_name);
