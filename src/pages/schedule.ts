import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/schedule.js?raw'

export function schedulePage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '작업 스케줄',
    activePage: '/schedule',
    pageContent: `
            <!-- 요약 통계 -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div class="bg-white rounded-lg shadow p-4">
                    <div class="text-sm text-gray-600 mb-1">총 대기 카드</div>
                    <div class="text-2xl font-bold text-blue-600" id="statTotalQueue">-</div>
                </div>
                <div class="bg-white rounded-lg shadow p-4">
                    <div class="text-sm text-gray-600 mb-1">미배정 카드</div>
                    <div class="text-2xl font-bold text-orange-600" id="statUnassigned">-</div>
                </div>
                <div class="bg-white rounded-lg shadow p-4">
                    <div class="text-sm text-gray-600 mb-1">오늘 납기</div>
                    <div class="text-2xl font-bold text-red-600" id="statTodayDue">-</div>
                </div>
                <div class="bg-white rounded-lg shadow p-4">
                    <div class="text-sm text-gray-600 mb-1">과부하 장비</div>
                    <div class="text-2xl font-bold text-red-600" id="statOverloaded">-</div>
                </div>
            </div>

            <!-- 메인 스케줄 보드 -->
            <div class="flex gap-4 overflow-x-auto pb-4" id="scheduleBoard" style="min-height: 500px;">
                <!-- 미배정 패널 -->
                <div class="flex-shrink-0 w-72 bg-orange-50 rounded-lg shadow">
                    <div class="p-3 border-b border-orange-200 bg-orange-100 rounded-t-lg">
                        <div class="flex items-center justify-between">
                            <h3 class="font-bold text-orange-800 text-sm">
                                <i class="fas fa-inbox mr-1"></i>
                                미배정
                                <span class="text-xs font-normal ml-1" id="unassignedCount"></span>
                            </h3>
                        </div>
                    </div>
                    <div id="unassignedCards" class="p-2 space-y-2 min-h-[200px] max-h-[calc(100vh-300px)] overflow-y-auto"
                         data-equipment-id="">
                        <div class="text-center text-gray-400 py-4 text-sm">로딩 중...</div>
                    </div>
                </div>

                <!-- 장비별 칼럼 (JS에서 동적 생성) -->
                <div id="equipmentColumns" class="flex gap-4">
                    <div class="text-center text-gray-400 py-8">장비 정보를 불러오는 중...</div>
                </div>
            </div>
    `,
    pageScript
  })
}
