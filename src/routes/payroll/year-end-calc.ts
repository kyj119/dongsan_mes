/**
 * 연말정산 산식 — 순수 함수(DB 없음). year-end.ts POST /year-end-settlement/:employeeId 가 쓴다.
 * 게이트: scripts/year-end-deduction-selftest.cjs (test:calc)
 *
 * ★ 2026-09-03 정정 — 같은 금액을 소득공제와 세액공제 양쪽에 넣던 이중공제 제거.
 *   · 보장성보험료·의료비·교육비·기부금 = **특별세액공제만**(소득세법 §59의4, 2014 귀속분부터 소득공제→세액공제 전환).
 *     종전엔 과세표준에서도 빼고 12~15% 세액공제도 해 결정세액이 과소·환급이 과대였다.
 *   · 국민연금 = **연금보험료 소득공제만**(§51의3 전액). 12% 세액공제는 근거 없음(연금계좌 세액공제와 혼동).
 *   · 연금저축 = **연금계좌 세액공제**(§59의3: 총급여 5,500만 이하 15% · 초과 12%, 납입한도 600만). 소득공제 아님.
 *   · 표준세액공제 13만 = 특별소득공제(주택자금)·특별세액공제·월세공제를 하나도 안 받을 때(§59의4⑨).
 */

// 근로소득공제 (2026년 세법 기준)
export function calcEarnedIncomeDeduction(grossTaxable: number): number {
  if (grossTaxable <= 5000000) return Math.floor(grossTaxable * 0.7)
  if (grossTaxable <= 15000000) return 3500000 + Math.floor((grossTaxable - 5000000) * 0.4)
  if (grossTaxable <= 45000000) return 7500000 + Math.floor((grossTaxable - 15000000) * 0.15)
  if (grossTaxable <= 100000000) return 12000000 + Math.floor((grossTaxable - 45000000) * 0.05)
  return Math.min(14750000 + Math.floor((grossTaxable - 100000000) * 0.02), 20000000)
}

// 종합소득세 세율표 (2026년 기준)
export function calcIncomeTax(taxableIncome: number): number {
  if (taxableIncome <= 14000000) return Math.floor(taxableIncome * 0.06)
  if (taxableIncome <= 50000000) return 840000 + Math.floor((taxableIncome - 14000000) * 0.15)
  if (taxableIncome <= 88000000) return 6240000 + Math.floor((taxableIncome - 50000000) * 0.24)
  if (taxableIncome <= 150000000) return 15360000 + Math.floor((taxableIncome - 88000000) * 0.35)
  if (taxableIncome <= 300000000) return 37060000 + Math.floor((taxableIncome - 150000000) * 0.38)
  if (taxableIncome <= 500000000) return 94060000 + Math.floor((taxableIncome - 300000000) * 0.40)
  if (taxableIncome <= 1000000000) return 174060000 + Math.floor((taxableIncome - 500000000) * 0.42)
  return 384060000 + Math.floor((taxableIncome - 1000000000) * 0.45)
}

// 근로소득세액공제
export function calcEarnedTaxCredit(calculatedTax: number, grossTaxable: number): number {
  let credit: number
  if (calculatedTax <= 1300000) {
    credit = Math.floor(calculatedTax * 0.55)
  } else {
    credit = 715000 + Math.floor((calculatedTax - 1300000) * 0.30)
  }
  // 한도
  if (grossTaxable <= 33000000) return Math.min(credit, 740000)
  if (grossTaxable <= 70000000) return Math.min(credit, 660000)
  return Math.min(credit, 500000)
}

export interface YearEndInput {
  totalSalary: number
  totalNontax: number
  /** 급여에서 원천공제된 국민연금 연 합계 (소득공제 전액) */
  nationalPension: number
  prepaidIncomeTax: number
  prepaidLocalTax: number
  dependentsCount: number
  additionalAged: number          // 인원
  additionalDisabled: number      // 인원
  additionalSingleParent: number  // 금액(50만/100만 직접 입력)
  insurance: number               // 보장성보험료 납입액
  medical: number                 // 의료비 지출액(총액)
  education: number
  housing: number                 // 주택자금 (특별소득공제)
  donation: number
  pensionSaving: number           // 연금저축 납입액
  creditCard: number              // 신용카드 소득공제액
  childTaxCredit: number
}

export interface YearEndResult {
  grossTaxable: number
  earnedIncomeDeduction: number
  earnedIncome: number
  basicDeduction: number
  additionalAged: number
  additionalDisabled: number
  additionalSingleParent: number
  /** 세액공제 기준액(공제 대상액) — DB 컬럼명은 *_deduction 이지만 과세표준에서 빼지 않는다 */
  insuranceDeduction: number
  medicalDeduction: number
  educationDeduction: number
  housingDeduction: number
  donationDeduction: number
  nationalPensionDeduction: number
  pensionSaving: number
  creditCardDeduction: number
  totalDeductions: number
  taxableIncome: number
  calculatedTax: number
  earnedTaxCredit: number
  childTaxCredit: number
  insurancePremiumCredit: number
  medicalCredit: number
  educationCredit: number
  donationCredit: number
  /** 연금계좌(연금저축) 세액공제 */
  pensionContributionCredit: number
  standardTaxCredit: number
  totalTaxCredits: number
  determinedTax: number
  determinedLocalTax: number
  refundIncomeTax: number
  refundLocalTax: number
  refundTotal: number
}

export function calcYearEndSettlement(i: YearEndInput): YearEndResult {
  const n = (v: unknown) => Number(v) || 0
  const grossTaxable = n(i.totalSalary) - n(i.totalNontax)

  // 1) 근로소득금액 = 총급여 − 비과세 − 근로소득공제
  const earnedIncomeDeduction = calcEarnedIncomeDeduction(grossTaxable)
  const earnedIncome = Math.max(0, grossTaxable - earnedIncomeDeduction)

  // 2) 인적공제
  const dependentsCount = Math.max(1, n(i.dependentsCount) || 1)
  const basicDeduction = dependentsCount * 1500000
  const additionalAged = n(i.additionalAged) * 1000000
  const additionalDisabled = n(i.additionalDisabled) * 2000000
  const additionalSingleParent = n(i.additionalSingleParent)

  // 3) 특별세액공제 기준액 (과세표준 차감 아님)
  const insuranceDeduction = Math.min(n(i.insurance), 1000000)                       // 보장성보험 한도 100만
  const medicalDeduction = Math.max(0, n(i.medical) - Math.floor(grossTaxable * 0.03)) // 총급여 3% 초과분
  const educationDeduction = n(i.education)
  const housingDeduction = n(i.housing)                                                // 특별소득공제(과세표준 차감)
  const donationDeduction = n(i.donation)

  // 4) 소득공제 — 국민연금(전액) · 주택자금 · 신용카드
  const nationalPensionDeduction = n(i.nationalPension)
  const pensionSaving = Math.min(n(i.pensionSaving), 6000000)                          // 연금저축 납입한도 600만
  const creditCardDeduction = n(i.creditCard)

  // 5) 과세표준
  const totalDeductions = basicDeduction + additionalAged + additionalDisabled + additionalSingleParent
    + housingDeduction + nationalPensionDeduction + creditCardDeduction
  const taxableIncome = Math.max(0, earnedIncome - totalDeductions)

  // 6) 산출세액
  const calculatedTax = calcIncomeTax(taxableIncome)

  // 7) 세액공제
  const earnedTaxCredit = calcEarnedTaxCredit(calculatedTax, grossTaxable)
  const childTaxCredit = n(i.childTaxCredit)
  const insurancePremiumCredit = Math.floor(insuranceDeduction * 0.12)
  const medicalCredit = Math.floor(medicalDeduction * 0.15)
  const educationCredit = Math.floor(educationDeduction * 0.15)
  const donationCredit = Math.floor(donationDeduction * 0.15)
  const pensionRate = grossTaxable <= 55000000 ? 0.15 : 0.12
  const pensionContributionCredit = Math.floor(pensionSaving * pensionRate)
  // 표준세액공제 13만: 특별소득공제(주택자금)·특별세액공제 어느 것도 없을 때
  const hasSpecial = insuranceDeduction + medicalDeduction + educationDeduction + housingDeduction + donationDeduction > 0
  const standardTaxCredit = hasSpecial ? 0 : 130000

  const totalTaxCredits = earnedTaxCredit + childTaxCredit + insurancePremiumCredit
    + medicalCredit + educationCredit + donationCredit + pensionContributionCredit + standardTaxCredit

  // 8) 결정세액 · 차감징수(환급)
  const determinedTax = Math.max(0, calculatedTax - totalTaxCredits)
  const determinedLocalTax = Math.floor(determinedTax * 0.1)
  const refundIncomeTax = n(i.prepaidIncomeTax) - determinedTax
  const refundLocalTax = n(i.prepaidLocalTax) - determinedLocalTax
  const refundTotal = refundIncomeTax + refundLocalTax

  return {
    grossTaxable, earnedIncomeDeduction, earnedIncome,
    basicDeduction, additionalAged, additionalDisabled, additionalSingleParent,
    insuranceDeduction, medicalDeduction, educationDeduction, housingDeduction, donationDeduction,
    nationalPensionDeduction, pensionSaving, creditCardDeduction,
    totalDeductions, taxableIncome, calculatedTax,
    earnedTaxCredit, childTaxCredit, insurancePremiumCredit, medicalCredit, educationCredit, donationCredit,
    pensionContributionCredit, standardTaxCredit, totalTaxCredits,
    determinedTax, determinedLocalTax, refundIncomeTax, refundLocalTax, refundTotal,
  }
}
