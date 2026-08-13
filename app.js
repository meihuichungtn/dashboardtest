/* ==========================================================================
   教育部(獎)補助經費統計分析儀表板 - 主程式邏輯 (app.js)
   新功能增強版：
   1. 計畫別採用直觀切換鈕 (Segmented Control)，不使用下拉選單。
   2. 單校歷年變動加入【私校類組篩選器】，目標學校選單隨類組即時連動。
   ========================================================================== */

// --- Global Data & Fixed Category Order ---
let rawRecords = [];
let allProjects = ['私校獎補助計畫', '高教深耕計畫'];
let allYears = []; // Dynamically extracted and sorted DESCENDING (114, 113, 112...)
let allSchools = [];

// Map school to its category for fast lookup
const schoolCategoryMap = {};

// Strict Category Order per Requirement
const ORDERED_CATEGORIES = [
  '綜合大學一',
  '綜合大學二',
  '醫學類組',
  '宗教研修學院',
  '停辦',
  '公立'
];

// --- Independent Filter States per Tab ---
const filterState = {
  ranking: {
    project: 'all',
    years: new Set([114]),
    category: '綜合大學一',
    topN: '20',
    sort: 'desc'
  },
  pivot: {
    years: new Set([114]),
    category: '綜合大學一',
    search: '',
    sortCol: 'total',
    sortDir: 'desc'
  },
  detail: {
    project: 'all',
    years: new Set([114]),
    category: '綜合大學一',
    search: '',
    currentPage: 1,
    pageSize: 25,
    sortCol: 'amount',
    sortDir: 'desc'
  },
  school: {
    category: '綜合大學一',
    selectedSchool: ''
  }
};

// Chart Instances
let rankingChartInstance = null;
let schoolTrendChartInstance = null;

// --- Clean Number Formatter ---
function formatNumber(amount) {
  if (amount === undefined || amount === null || isNaN(amount)) return '0';
  return Math.round(amount).toLocaleString('en-US');
}

function formatShortAmount(amount) {
  if (!amount) return '0';
  if (amount >= 100000000) {
    return (amount / 100000000).toFixed(2) + ' 億';
  } else if (amount >= 10000) {
    return (amount / 10000).toFixed(0) + ' 萬';
  }
  return Math.round(amount).toLocaleString('en-US');
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  initData();
});

function initData() {
  if (typeof DASHBOARD_DATA !== 'undefined' && Array.isArray(DASHBOARD_DATA)) {
    rawRecords = DASHBOARD_DATA;
    onDataLoaded();
  } else {
    fetch('data.json?t=' + new Date().getTime())
      .then(res => res.json())
      .then(data => {
        rawRecords = data;
        onDataLoaded();
      })
      .catch(err => console.error("Failed to load data:", err));
  }
}

function onDataLoaded() {
  // Extract ALL distinct years and SORT DESCENDING (e.g. 114, 113, 112, 111, 110, 109)
  allYears = Array.from(new Set(rawRecords.map(r => r.year))).filter(Boolean).sort((a, b) => b - a);
  
  allProjects = Array.from(new Set(rawRecords.map(r => r.project))).filter(Boolean);

  // Build school to category mapping
  rawRecords.forEach(r => {
    if (r.school && r.category) {
      schoolCategoryMap[r.school] = r.category;
    }
  });

  allSchools = Array.from(new Set(rawRecords.map(r => r.school))).filter(Boolean).sort((a, b) => a.localeCompare(b, 'zh-TW'));

  const defaultYear = allYears.includes(114) ? 114 : allYears[0];
  ['ranking', 'pivot', 'detail'].forEach(tabId => {
    filterState[tabId].years = new Set([defaultYear]);
    renderYearDropdownCheckboxes(tabId);
  });

  // Populate Single School Select Dropdown linked to default Category ('綜合大學一')
  populateSchoolSelect();

  renderRankingChart();
}

// --- Direct Visible Segmented Control Project Selection ---
function setProjectFilter(tabId, projValue) {
  filterState[tabId].project = projValue;

  const container = document.getElementById(`projSegmented_${tabId}`);
  if (container) {
    container.querySelectorAll('.segmented-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-value') === projValue);
    });
  }

  if (tabId === 'ranking') renderRankingChart();
  else if (tabId === 'detail') {
    filterState.detail.currentPage = 1;
    renderDetailTable();
  }
}

// --- Multi-Select Year Dropdown UI Logic ---
function renderYearDropdownCheckboxes(tabId) {
  const container = document.getElementById(`checkboxesYear_${tabId}`);
  if (!container) return;

  const currentSet = filterState[tabId].years;

  container.innerHTML = allYears.map(yr => {
    const isChecked = currentSet.has(yr);
    return `
      <label class="dropdown-item">
        <input type="checkbox" value="${yr}" ${isChecked ? 'checked' : ''} onchange="onYearCheckChange('${tabId}')">
        <span>${yr} 年度</span>
      </label>
    `;
  }).join('');

  updateYearDropdownLabel(tabId);
}

function toggleDropdown(dropdownId) {
  const dropdown = document.getElementById(dropdownId);
  if (!dropdown) return;
  const menu = dropdown.querySelector('.dropdown-menu');
  
  document.querySelectorAll('.dropdown-menu').forEach(m => {
    if (m !== menu) m.classList.remove('show');
  });

  menu.classList.toggle('show');
}

function onYearCheckChange(tabId) {
  const container = document.getElementById(`checkboxesYear_${tabId}`);
  const checkedInputs = container.querySelectorAll('input[type="checkbox"]:checked');
  
  if (checkedInputs.length === 0) {
    alert("請至少保留勾選一個年度！");
    renderYearDropdownCheckboxes(tabId);
    return;
  }

  const newSet = new Set(Array.from(checkedInputs).map(cb => parseInt(cb.value, 10)));
  filterState[tabId].years = newSet;

  updateYearDropdownLabel(tabId);

  if (tabId === 'ranking') renderRankingChart();
  else if (tabId === 'pivot') renderPivotTables();
  else if (tabId === 'detail') {
    filterState.detail.currentPage = 1;
    renderDetailTable();
  }
}

function selectAllYearsInTab(tabId, selectAll) {
  if (selectAll) {
    filterState[tabId].years = new Set(allYears);
  } else {
    const defaultYr = allYears.includes(114) ? 114 : allYears[0];
    filterState[tabId].years = new Set([defaultYr]);
  }
  renderYearDropdownCheckboxes(tabId);

  if (tabId === 'ranking') renderRankingChart();
  else if (tabId === 'pivot') renderPivotTables();
  else if (tabId === 'detail') {
    filterState.detail.currentPage = 1;
    renderDetailTable();
  }
}

function updateYearDropdownLabel(tabId) {
  const label = document.getElementById(`dropdownLabel_${tabId}`);
  if (!label) return;

  const count = filterState[tabId].years.size;
  if (count === allYears.length) {
    label.textContent = `全選 (${count}個年度)`;
  } else {
    const listStr = Array.from(filterState[tabId].years).sort((a,b)=>b-a).map(y => `${y}年`).join(',');
    label.textContent = `${listStr} (${count}個)`;
  }
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.custom-dropdown')) {
    document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('show'));
  }
});

function getCategoryBadgeClass(cat) {
  if (cat.includes('一')) return 'badge-cat-1';
  if (cat.includes('二')) return 'badge-cat-2';
  if (cat.includes('醫學')) return 'badge-cat-med';
  if (cat.includes('公立')) return 'badge-cat-pub';
  if (cat.includes('宗教')) return 'badge-cat-rel';
  if (cat.includes('停辦')) return 'badge-cat-closed';
  return 'badge-cat-1';
}

// ===================================================================
// TAB 1: RANKING CHART (各校核定金額排行榜 - 堆疊橫向柱狀圖)
// 私校獎補助計畫 = 藍色 (#3B82F6), 高教深耕計畫 = 綠色 (#10B981)
// ===================================================================
function renderRankingChart() {
  const catSelect = document.getElementById('rankingCatSelect');
  const topNSelect = document.getElementById('rankingTopNSelect');
  const sortSelect = document.getElementById('rankingSortOrder');

  if (catSelect) filterState.ranking.category = catSelect.value;
  if (topNSelect) filterState.ranking.topN = topNSelect.value;
  if (sortSelect) filterState.ranking.sort = sortSelect.value;

  const st = filterState.ranking;

  let records = rawRecords.filter(r => {
    const matchProj = st.project === 'all' || r.project === st.project;
    const matchYr = st.years.has(r.year);
    const matchCat = st.category === 'all' || r.category === st.category;
    return matchProj && matchYr && matchCat;
  });

  const schoolMap = {};
  records.forEach(r => {
    if (!schoolMap[r.school]) {
      schoolMap[r.school] = {
        school: r.school,
        privateAmt: 0,
        sproutAmt: 0,
        totalAmt: 0
      };
    }
    if (r.project === '私校獎補助計畫') {
      schoolMap[r.school].privateAmt += r.amount;
    } else if (r.project === '高教深耕計畫') {
      schoolMap[r.school].sproutAmt += r.amount;
    }
    schoolMap[r.school].totalAmt += r.amount;
  });

  let sortedData = Object.values(schoolMap);
  sortedData.sort((a, b) => st.sort === 'desc' ? b.totalAmt - a.totalAmt : a.totalAmt - b.totalAmt);

  if (st.topN !== 'all') {
    sortedData = sortedData.slice(0, parseInt(st.topN, 10));
  }

  const labels = sortedData.map(d => d.school);
  const privateAmounts = sortedData.map(d => d.privateAmt);
  const sproutAmounts = sortedData.map(d => d.sproutAmt);

  const ctx = document.getElementById('rankingChart').getContext('2d');

  if (rankingChartInstance) {
    rankingChartInstance.destroy();
  }

  const textColor = '#0f172a';
  const gridColor = 'rgba(0, 0, 0, 0.08)';

  rankingChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: '私校獎補助計畫 (藍色)',
          data: privateAmounts,
          backgroundColor: '#3b82f6',
          hoverBackgroundColor: '#2563eb',
          borderRadius: 4,
          stack: 'Stack 0'
        },
        {
          label: '高教深耕計畫 (綠色)',
          data: sproutAmounts,
          backgroundColor: '#10b981',
          hoverBackgroundColor: '#059669',
          borderRadius: 4,
          stack: 'Stack 0'
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: textColor,
            font: { family: 'Noto Sans TC', size: 12, weight: '600' },
            usePointStyle: true
          }
        },
        tooltip: {
          backgroundColor: 'rgba(255, 255, 255, 0.98)',
          titleColor: textColor,
          bodyColor: textColor,
          borderColor: 'rgba(59, 130, 246, 0.3)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: function(context) {
              const label = context.dataset.label || '';
              const val = context.raw || 0;
              return `${label}: ${formatNumber(val)} (${formatShortAmount(val)})`;
            },
            footer: function(tooltipItems) {
              let total = 0;
              tooltipItems.forEach(item => {
                total += item.raw || 0;
              });
              return `全計畫合計: ${formatNumber(total)} (${formatShortAmount(total)})`;
            }
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            font: { family: 'Inter', size: 11 },
            callback: function(val) { return formatShortAmount(val); }
          }
        },
        y: {
          stacked: true,
          grid: { display: false },
          ticks: {
            color: textColor,
            font: { family: 'Noto Sans TC', size: 12, weight: '500' }
          }
        }
      }
    }
  });
}

// ===================================================================
// TAB 2: CROSS-TABULATION PIVOT TABLES (核定金額交叉報表 - 依計畫別分開)
// ===================================================================
function renderPivotTables() {
  const catSelect = document.getElementById('pivotCatSelect');
  const searchInput = document.getElementById('pivotSearchInput');

  if (catSelect) filterState.pivot.category = catSelect.value;
  if (searchInput) filterState.pivot.search = searchInput.value.trim().toLowerCase();

  const st = filterState.pivot;
  const activeYears = Array.from(st.years).sort((a, b) => a - b);

  renderSinglePivotTable('私校獎補助計畫', 'pivotTable_private', activeYears, st);
  renderSinglePivotTable('高教深耕計畫', 'pivotTable_sprout', activeYears, st);
}

function renderSinglePivotTable(projectName, tableElemId, activeYears, st) {
  let records = rawRecords.filter(r => {
    const matchProj = r.project === projectName;
    const matchYr = st.years.has(r.year);
    const matchCat = st.category === 'all' || r.category === st.category;
    return matchProj && matchYr && matchCat;
  });

  const matrix = {};
  records.forEach(r => {
    if (!matrix[r.school]) {
      matrix[r.school] = {
        school: r.school,
        category: r.category,
        years: {},
        total: 0
      };
    }
    matrix[r.school].years[r.year] = (matrix[r.school].years[r.year] || 0) + r.amount;
    matrix[r.school].total += r.amount;
  });

  let rows = Object.values(matrix);

  if (st.search) {
    rows = rows.filter(r => r.school.toLowerCase().includes(st.search) || r.category.toLowerCase().includes(st.search));
  }

  rows.sort((a, b) => {
    let valA, valB;
    if (st.sortCol === 'school') {
      valA = a.school; valB = b.school;
      return st.sortDir === 'asc' ? valA.localeCompare(valB, 'zh-TW') : valB.localeCompare(valA, 'zh-TW');
    } else if (st.sortCol === 'category') {
      valA = a.category; valB = b.category;
      return st.sortDir === 'asc' ? valA.localeCompare(valB, 'zh-TW') : valB.localeCompare(valA, 'zh-TW');
    } else if (st.sortCol === 'total') {
      valA = a.total; valB = b.total;
    } else {
      const yr = parseInt(st.sortCol, 10);
      valA = a.years[yr] || 0;
      valB = b.years[yr] || 0;
    }
    return st.sortDir === 'asc' ? valA - valB : valB - valA;
  });

  const yearTotals = {};
  activeYears.forEach(y => yearTotals[y] = 0);
  let grandTotal = 0;

  rows.forEach(r => {
    activeYears.forEach(y => {
      yearTotals[y] += (r.years[y] || 0);
    });
    grandTotal += r.total;
  });

  let html = `
    <thead>
      <tr>
        <th class="sortable" onclick="handlePivotSort('school')">
          學校名稱 ${st.sortCol === 'school' ? (st.sortDir === 'asc' ? '▲' : '▼') : ''}
        </th>
        <th class="sortable" onclick="handlePivotSort('category')">
          私校類組 ${st.sortCol === 'category' ? (st.sortDir === 'asc' ? '▲' : '▼') : ''}
        </th>
  `;

  activeYears.forEach(yr => {
    const isSorted = st.sortCol === String(yr);
    html += `
      <th class="sortable num-cell" onclick="handlePivotSort('${yr}')">
        ${yr} 年度 ${isSorted ? (st.sortDir === 'asc' ? '▲' : '▼') : ''}
      </th>
    `;
  });

  const isTotalSorted = st.sortCol === 'total';
  html += `
        <th class="sortable num-cell" style="color: var(--accent-primary);" onclick="handlePivotSort('total')">
          歷年合計 ${isTotalSorted ? (st.sortDir === 'asc' ? '▲' : '▼') : ''}
        </th>
      </tr>
    </thead>
    <tbody>
  `;

  if (rows.length === 0) {
    html += `
      <tr>
        <td colspan="${activeYears.length + 3}" class="empty-state">
          <p>沒有符合條件的 ${projectName} 交叉報表資料</p>
        </td>
      </tr>
    `;
  } else {
    rows.forEach(r => {
      const catBadgeClass = getCategoryBadgeClass(r.category);
      html += `
        <tr>
          <td style="font-weight: 600;">${r.school}</td>
          <td><span class="badge ${catBadgeClass}">${r.category}</span></td>
      `;

      activeYears.forEach(y => {
        const val = r.years[y];
        html += `<td class="num-cell">${val ? formatNumber(val) : '-'}</td>`;
      });

      html += `<td class="num-cell" style="font-weight: 700; color: var(--accent-primary);">${formatNumber(r.total)}</td></tr>`;
    });

    html += `
      <tr class="total-row">
        <td colspan="2">加總合計 (${rows.length} 所學校)</td>
    `;
    activeYears.forEach(y => {
      html += `<td class="num-cell">${formatNumber(yearTotals[y])}</td>`;
    });
    html += `<td class="num-cell">${formatNumber(grandTotal)}</td></tr>`;
  }

  html += `</tbody>`;
  document.getElementById(tableElemId).innerHTML = html;
}

function handlePivotSort(col) {
  const st = filterState.pivot;
  if (st.sortCol === col) {
    st.sortDir = st.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    st.sortCol = col;
    st.sortDir = col === 'school' || col === 'category' ? 'asc' : 'desc';
  }
  renderPivotTables();
}

// ===================================================================
// TAB 3: DETAILED DATA TABLE (明細資料表格)
// ===================================================================
function renderDetailTable() {
  const catSelect = document.getElementById('detailCatSelect');
  const searchInput = document.getElementById('detailSearchInput');

  if (catSelect) filterState.detail.category = catSelect.value;
  if (searchInput) filterState.detail.search = searchInput.value.trim().toLowerCase();

  const st = filterState.detail;

  let records = rawRecords.filter(r => {
    const matchProj = st.project === 'all' || r.project === st.project;
    const matchYr = st.years.has(r.year);
    const matchCat = st.category === 'all' || r.category === st.category;
    return matchProj && matchYr && matchCat;
  });

  if (st.search) {
    records = records.filter(r => 
      r.school.toLowerCase().includes(st.search) ||
      r.category.toLowerCase().includes(st.search) ||
      r.project.toLowerCase().includes(st.search) ||
      String(r.year).includes(st.search)
    );
  }

  records.sort((a, b) => {
    let res = 0;
    const col = st.sortCol;
    const dir = st.sortDir === 'asc' ? 1 : -1;

    if (col === 'amount') {
      res = (a.amount - b.amount) * dir;
      if (res === 0) res = (b.year - a.year);
    } else if (col === 'year') {
      res = (a.year - b.year) * dir;
      if (res === 0) res = (b.amount - a.amount);
    } else if (col === 'school') {
      res = a.school.localeCompare(b.school, 'zh-TW') * dir;
      if (res === 0) res = (b.year - a.year);
    } else if (col === 'category') {
      res = a.category.localeCompare(b.category, 'zh-TW') * dir;
      if (res === 0) res = (b.amount - a.amount);
    } else if (col === 'project') {
      res = a.project.localeCompare(b.project, 'zh-TW') * dir;
      if (res === 0) res = (b.amount - a.amount);
    }

    return res;
  });

  ['year', 'school', 'category', 'project', 'amount'].forEach(c => {
    const icon = document.getElementById(`sortIcon_${c}`);
    if (icon) {
      if (c === st.sortCol) {
        icon.className = `fa-solid fa-sort-${st.sortDir === 'asc' ? 'up' : 'down'}`;
      } else {
        icon.className = `fa-solid fa-sort`;
      }
    }
  });

  const totalCount = records.length;
  let pageRecords = records;
  let totalPages = 1;

  if (st.pageSize > 0) {
    totalPages = Math.ceil(totalCount / st.pageSize) || 1;
    if (st.currentPage > totalPages) st.currentPage = totalPages;
    if (st.currentPage < 1) st.currentPage = 1;

    const startIdx = (st.currentPage - 1) * st.pageSize;
    const endIdx = startIdx + st.pageSize;
    pageRecords = records.slice(startIdx, endIdx);
  }

  const tbody = document.getElementById('detailTableBody');
  if (pageRecords.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">
          <i class="fa-solid fa-folder-open empty-icon"></i>
          <p>沒有符合搜尋條件的明細資料</p>
        </td>
      </tr>
    `;
  } else {
    tbody.innerHTML = pageRecords.map(r => {
      const catBadge = getCategoryBadgeClass(r.category);
      const projBadge = r.project.includes('高教') ? 'badge-proj-sprout' : 'badge-proj-private';
      return `
        <tr>
          <td style="font-weight: 600;">${r.year} 年</td>
          <td style="font-weight: 700;">${r.school}</td>
          <td><span class="badge ${catBadge}">${r.category}</span></td>
          <td><span class="badge ${projBadge}">${r.project}</span></td>
          <td class="num-cell" style="font-weight: 700;">${formatNumber(r.amount)}</td>
          <td style="text-align: center;">
            <button class="btn btn-outline" style="padding: 4px 10px; font-size: 12px; border-color: var(--accent-primary); color: var(--accent-primary);" onclick="jumpToSchoolTrend('${r.school}')" title="查看 ${r.school} 歷年變動趨勢">
              <i class="fa-solid fa-chart-line"></i> 查看趨勢
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  const startItem = totalCount > 0 ? (st.currentPage - 1) * (st.pageSize > 0 ? st.pageSize : totalCount) + 1 : 0;
  const endItem = st.pageSize > 0 ? Math.min(st.currentPage * st.pageSize, totalCount) : totalCount;

  document.getElementById('detailTableInfo').textContent = `顯示第 ${startItem} 至 ${endItem} 筆，共 ${totalCount} 筆資料 (資料庫共 ${rawRecords.length} 筆紀錄)`;

  renderPaginationControls(totalPages);
}

function handleDetailSort(column) {
  const st = filterState.detail;
  if (st.sortCol === column) {
    st.sortDir = st.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    st.sortCol = column;
    st.sortDir = column === 'year' || column === 'school' ? 'asc' : 'desc';
  }
  st.currentPage = 1;
  renderDetailTable();
}

function onDetailSearchInput() {
  filterState.detail.currentPage = 1;
  renderDetailTable();
}

function onPageSizeChange() {
  filterState.detail.pageSize = parseInt(document.getElementById('pageSizeSelect').value, 10);
  filterState.detail.currentPage = 1;
  renderDetailTable();
}

function renderPaginationControls(totalPages) {
  const container = document.getElementById('detailPagination');
  const st = filterState.detail;
  if (st.pageSize <= 0 || totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = `
    <button class="page-btn" onclick="changeDetailPage(1)" ${st.currentPage === 1 ? 'disabled' : ''} title="第一頁">
      <i class="fa-solid fa-angles-left"></i>
    </button>
    <button class="page-btn" onclick="changeDetailPage(${st.currentPage - 1})" ${st.currentPage === 1 ? 'disabled' : ''} title="上一頁">
      <i class="fa-solid fa-angle-left"></i>
    </button>
  `;

  const maxVisiblePages = 5;
  let startPage = Math.max(1, st.currentPage - Math.floor(maxVisiblePages / 2));
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
  if (endPage - startPage + 1 < maxVisiblePages) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }

  for (let p = startPage; p <= endPage; p++) {
    html += `
      <button class="page-btn ${p === st.currentPage ? 'active' : ''}" onclick="changeDetailPage(${p})">
        ${p}
      </button>
    `;
  }

  html += `
    <button class="page-btn" onclick="changeDetailPage(${st.currentPage + 1})" ${st.currentPage === totalPages ? 'disabled' : ''} title="下一頁">
      <i class="fa-solid fa-angle-right"></i>
    </button>
    <button class="page-btn" onclick="changeDetailPage(${totalPages})" ${st.currentPage === totalPages ? 'disabled' : ''} title="最後一頁">
      <i class="fa-solid fa-angles-right"></i>
    </button>
  `;

  container.innerHTML = html;
}

function changeDetailPage(page) {
  filterState.detail.currentPage = page;
  renderDetailTable();
}

// ===================================================================
// TAB 4: SINGLE SCHOOL TREND (單校歷年變動趨勢 - 類組與學校清單連動)
// ===================================================================
function populateSchoolSelect() {
  const select = document.getElementById('schoolSelect');
  if (!select) return;

  const currentCat = filterState.school.category;

  // Filter schools based on selected category (if not 'all')
  let filteredSchools = allSchools;
  if (currentCat !== 'all') {
    filteredSchools = allSchools.filter(sch => schoolCategoryMap[sch] === currentCat);
  }

  if (filteredSchools.length === 0) {
    select.innerHTML = `<option value="">(此類組無學校資料)</option>`;
    filterState.school.selectedSchool = '';
    renderSchoolTrendView();
    return;
  }

  select.innerHTML = filteredSchools.map(sch => `<option value="${sch}">${sch}</option>`).join('');

  // Keep selected school if still in filtered list, else default to first
  if (!filteredSchools.includes(filterState.school.selectedSchool)) {
    filterState.school.selectedSchool = filteredSchools[0];
  }
  select.value = filterState.school.selectedSchool;
}

function onSchoolCategoryChange() {
  const catSelect = document.getElementById('schoolCatSelect');
  if (catSelect) {
    filterState.school.category = catSelect.value;
  }
  populateSchoolSelect();
  renderSchoolTrendView();
}

function jumpToSchoolTrend(schoolName) {
  const schCat = schoolCategoryMap[schoolName] || 'all';
  filterState.school.category = schCat;
  filterState.school.selectedSchool = schoolName;

  const catSelect = document.getElementById('schoolCatSelect');
  if (catSelect) catSelect.value = schCat;

  populateSchoolSelect();
  switchTab('school');
  renderSchoolTrendView();
}

function onSchoolSelectChange() {
  filterState.school.selectedSchool = document.getElementById('schoolSelect').value;
  renderSchoolTrendView();
}

function renderSchoolTrendView() {
  const schoolName = filterState.school.selectedSchool;
  if (!schoolName) {
    document.getElementById('schoolChartTitle').textContent = `請選擇學校`;
    document.getElementById('schoolTableMainTitle').textContent = `請選擇學校`;
    if (schoolTrendChartInstance) schoolTrendChartInstance.destroy();
    document.getElementById('schoolTableBody_private').innerHTML = `<tr><td colspan="5" class="empty-state"><p>無學校資料</p></td></tr>`;
    document.getElementById('schoolTableBody_sprout').innerHTML = `<tr><td colspan="5" class="empty-state"><p>無學校資料</p></td></tr>`;
    return;
  }

  const schoolRecords = rawRecords.filter(r => r.school === schoolName);

  document.getElementById('schoolChartTitle').textContent = `${schoolName} - 歷年金額變動趨勢圖`;
  document.getElementById('schoolTableMainTitle').textContent = `${schoolName} - 歷年核定金額明細與年增減分析 (依計畫別分開呈現)`;

  renderSchoolTrendChart(schoolName, schoolRecords);
  renderSingleSchoolProjectTable(schoolRecords, '私校獎補助計畫', 'schoolTableBody_private');
  renderSingleSchoolProjectTable(schoolRecords, '高教深耕計畫', 'schoolTableBody_sprout');
}

function renderSchoolTrendChart(schoolName, schoolRecords) {
  const ctx = document.getElementById('schoolTrendChart').getContext('2d');
  
  if (schoolTrendChartInstance) {
    schoolTrendChartInstance.destroy();
  }

  const textColor = '#0f172a';
  const gridColor = 'rgba(0, 0, 0, 0.08)';

  // Chart Years ascending (109, 110, 111, 112, 113, 114)
  const chartYears = [...allYears].sort((a, b) => a - b);

  const projPrivateData = chartYears.map(y => {
    const r = schoolRecords.find(item => item.year === y && item.project === '私校獎補助計畫');
    return r ? r.amount : 0;
  });

  const projSproutData = chartYears.map(y => {
    const r = schoolRecords.find(item => item.year === y && item.project === '高教深耕計畫');
    return r ? r.amount : 0;
  });

  const totalData = chartYears.map(y => {
    return schoolRecords.filter(item => item.year === y).reduce((sum, item) => sum + item.amount, 0);
  });

  schoolTrendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartYears.map(y => `${y} 年度`),
      datasets: [
        {
          label: '私校獎補助計畫 (藍色)',
          data: projPrivateData,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.12)',
          fill: true,
          tension: 0.3,
          borderWidth: 3,
          pointRadius: 5,
          pointHoverRadius: 7
        },
        {
          label: '高教深耕計畫 (綠色)',
          data: projSproutData,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.12)',
          fill: true,
          tension: 0.3,
          borderWidth: 3,
          pointRadius: 5,
          pointHoverRadius: 7
        },
        {
          label: '全計畫總計 (橘黃色)',
          data: totalData,
          borderColor: '#f59e0b',
          borderDash: [5, 5],
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: textColor, font: { family: 'Noto Sans TC', size: 12, weight: '600' } }
        },
        tooltip: {
          backgroundColor: 'rgba(255, 255, 255, 0.98)',
          titleColor: textColor,
          bodyColor: textColor,
          borderColor: 'rgba(59, 130, 246, 0.3)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}：${formatNumber(context.raw)}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { family: 'Inter', size: 12 } }
        },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            font: { family: 'Inter', size: 11 },
            callback: function(val) { return formatShortAmount(val); }
          }
        }
      }
    }
  });
}

function renderSingleSchoolProjectTable(schoolRecords, projectName, tbodyId) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  const records = schoolRecords.filter(r => r.project === projectName).sort((a, b) => a.year - b.year);

  if (records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state" style="padding: 20px;">
          <p>該校無 ${projectName} 之核定資料</p>
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  records.forEach((r) => {
    const prevRecord = records.find(item => item.year === r.year - 1);
    let diffHtml = '-';
    let rateHtml = '-';

    if (prevRecord && prevRecord.amount > 0) {
      const diff = r.amount - prevRecord.amount;
      const rate = (diff / prevRecord.amount) * 100;

      if (diff >= 0) {
        diffHtml = `<span style="color: #059669; font-weight: 600;">+${formatNumber(diff)}</span>`;
        rateHtml = `<span class="trend-badge-up">+${rate.toFixed(2)}%</span>`;
      } else {
        diffHtml = `<span style="color: #e11d48; font-weight: 600;">${formatNumber(diff)}</span>`;
        rateHtml = `<span class="trend-badge-down">${rate.toFixed(2)}%</span>`;
      }
    }

    const catBadge = getCategoryBadgeClass(r.category);

    html += `
      <tr>
        <td style="font-weight: 700;">${r.year} 年</td>
        <td><span class="badge ${catBadge}">${r.category}</span></td>
        <td class="num-cell" style="font-weight: 700;">${formatNumber(r.amount)}</td>
        <td class="num-cell">${diffHtml}</td>
        <td class="num-cell">${rateHtml}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

// ===================================================================
// EXPORT FUNCTIONS (Excel & CSV)
// ===================================================================
function exportDetailExcel() {
  const st = filterState.detail;
  let records = rawRecords.filter(r => {
    const matchProj = st.project === 'all' || r.project === st.project;
    const matchYr = st.years.has(r.year);
    const matchCat = st.category === 'all' || r.category === st.category;
    return matchProj && matchYr && matchCat;
  });

  if (st.search) {
    records = records.filter(r => 
      r.school.toLowerCase().includes(st.search) ||
      r.category.toLowerCase().includes(st.search) ||
      r.project.toLowerCase().includes(st.search)
    );
  }

  if (records.length === 0) {
    alert("沒有符合條件的明細資料可供匯出！");
    return;
  }

  const exportData = records.map(r => ({
    '年度': r.year,
    '學校名稱': r.school,
    '私校類組': r.category,
    '計畫別': r.project,
    '核定金額': r.amount
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "補助明細");

  XLSX.writeFile(workbook, `教育部補助明細報表_${new Date().toISOString().slice(0,10)}.xlsx`);
}

function exportDetailCSV() {
  const st = filterState.detail;
  let records = rawRecords.filter(r => {
    const matchProj = st.project === 'all' || r.project === st.project;
    const matchYr = st.years.has(r.year);
    const matchCat = st.category === 'all' || r.category === st.category;
    return matchProj && matchYr && matchCat;
  });

  if (st.search) {
    records = records.filter(r => 
      r.school.toLowerCase().includes(st.search) ||
      r.category.toLowerCase().includes(st.search) ||
      r.project.toLowerCase().includes(st.search)
    );
  }

  if (records.length === 0) {
    alert("沒有符合條件的明細資料可供匯出！");
    return;
  }

  let csvContent = "\uFEFF年度,學校名稱,私校類組,計畫別,核定金額\n";
  records.forEach(r => {
    csvContent += `"${r.year}","${r.school}","${r.category}","${r.project}",${r.amount}\n`;
  });

  downloadCSV(csvContent, `教育部補助明細報表_${new Date().toISOString().slice(0,10)}.csv`);
}

function exportPivotExcel(projectName) {
  const st = filterState.pivot;
  const activeYears = Array.from(st.years).sort((a, b) => a - b);
  
  let records = rawRecords.filter(r => {
    const matchProj = r.project === projectName;
    const matchYr = st.years.has(r.year);
    const matchCat = st.category === 'all' || r.category === st.category;
    return matchProj && matchYr && matchCat;
  });

  if (records.length === 0) {
    alert("無資料可匯出！");
    return;
  }

  const matrix = {};
  records.forEach(r => {
    if (!matrix[r.school]) {
      matrix[r.school] = { '學校名稱': r.school, '私校類組': r.category };
      activeYears.forEach(y => matrix[r.school][`${y}年`] = 0);
      matrix[r.school]['歷年合計'] = 0;
    }
    matrix[r.school][`${r.year}年`] = (matrix[r.school][`${r.year}年`] || 0) + r.amount;
    matrix[r.school]['歷年合計'] += r.amount;
  });

  const exportData = Object.values(matrix);
  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, `${projectName}_交叉報表`);

  XLSX.writeFile(workbook, `${projectName}_核定金額交叉報表_${new Date().toISOString().slice(0,10)}.xlsx`);
}

function exportSchoolExcel() {
  const schoolName = filterState.school.selectedSchool;
  if (!schoolName) return;

  const schoolRecords = rawRecords.filter(r => r.school === schoolName).sort((a,b) => a.year - b.year);

  const exportData = schoolRecords.map(r => ({
    '學校名稱': r.school,
    '年度': r.year,
    '計畫別': r.project,
    '私校類組': r.category,
    '核定金額': r.amount
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, `${schoolName}_歷年明細`);

  XLSX.writeFile(workbook, `${schoolName}_歷年補助明細_${new Date().toISOString().slice(0,10)}.xlsx`);
}

function exportSchoolCSV() {
  const schoolName = filterState.school.selectedSchool;
  if (!schoolName) return;

  const schoolRecords = rawRecords.filter(r => r.school === schoolName).sort((a,b) => a.year - b.year);

  let csvContent = "\uFEFF學校名稱,年度,計畫別,私校類組,核定金額\n";
  schoolRecords.forEach(r => {
    csvContent += `"${r.school}","${r.year}","${r.project}","${r.category}",${r.amount}\n`;
  });

  downloadCSV(csvContent, `${schoolName}_歷年補助明細_${new Date().toISOString().slice(0,10)}.csv`);
}

function downloadCSV(csvText, filename) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// --- Tab Navigation (Left Sidebar Nav Version) ---
function switchTab(tabName) {
  const navItems = document.querySelectorAll('.nav-item');
  const panes = document.querySelectorAll('.tab-pane');

  navItems.forEach(item => item.classList.remove('active'));
  panes.forEach(pane => pane.classList.remove('active'));

  if (tabName === 'ranking') {
    if (navItems[0]) navItems[0].classList.add('active');
    document.getElementById('tabPaneRanking').classList.add('active');
    renderRankingChart();
  } else if (tabName === 'pivot') {
    if (navItems[1]) navItems[1].classList.add('active');
    document.getElementById('tabPanePivot').classList.add('active');
    renderPivotTables();
  } else if (tabName === 'detail') {
    if (navItems[2]) navItems[2].classList.add('active');
    document.getElementById('tabPaneDetail').classList.add('active');
    renderDetailTable();
  } else if (tabName === 'school') {
    if (navItems[3]) navItems[3].classList.add('active');
    document.getElementById('tabPaneSchool').classList.add('active');
    renderSchoolTrendView();
  }
}
