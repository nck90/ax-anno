import type { EditedAuction, AuctionCategory, AuctionCase } from './editing-rules';

function formatPrice(price: string): string {
  if (!price) return '';
  const num = parseInt(price.replace(/,/g, ''), 10);
  if (isNaN(num)) return price;
  return num.toLocaleString('ko-KR');
}

function buildCategoryHTML(cat: AuctionCategory): string {
  let rows = '';

  for (const item of cat.items) {
    // Combine all properties into single cell content
    const locations: string[] = [];
    const usages: string[] = [];
    let priceLines = '';
    const remarks: string[] = [];

    for (const p of item.properties) {
      locations.push(p.location);
      usages.push(p.usage || '');
      if (p.appraisalPrice) {
        priceLines += formatPrice(p.appraisalPrice) + '<br/>';
      }
      if (p.minimumPrice) {
        priceLines += formatPrice(p.minimumPrice) + '<br/>';
      }
    }

    // Remarks: combine non-empty
    for (const p of item.properties) {
      if (p.remarks && p.remarks !== '-') remarks.push(p.remarks);
    }

    // Case number with duplicate info
    const caseLabel = item.duplicateInfo
      ? `${item.caseNumber}<br/>${item.duplicateInfo}`
      : item.caseNumber;

    // Property number
    const propNos = item.properties.map(p => p.propertyNumber).filter(Boolean);
    const propNo = propNos.length > 0 ? propNos[0] : '1';

    rows += `<tr>
      <td class="col-case">${caseLabel}</td>
      <td class="col-propno">${propNo}</td>
      <td class="col-location">${locations.join('<br/>')}</td>
      <td class="col-usage">${usages.join('<br/>')}</td>
      <td class="col-price">${priceLines}</td>
      <td class="col-remarks">${remarks.join('<br/>')}</td>
    </tr>`;
  }

  return `
    <div class="category-section">
      <h3 class="cat-title">[${cat.name}]</h3>
      <table>
        <thead>
          <tr>
            <th class="col-case">사건번호</th>
            <th class="col-propno">물건번<br/>호</th>
            <th class="col-location">소재지 및 면적[㎡]</th>
            <th class="col-usage">용도</th>
            <th class="col-price">감정평가액<br/>최저매각가격<br/>[단위 : 원]</th>
            <th class="col-remarks">비고</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

export function generateHTML(data: EditedAuction): string {
  const { header, categories } = data;
  const categoriesHTML = categories.map(cat => buildCategoryHTML(cat)).join('');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"/>
<style>
@page {
  size: A4;
  margin: 15mm 12mm;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif;
  font-size: 9pt;
  line-height: 1.4;
  color: #000;
  background: #fff;
  -webkit-print-color-adjust: exact;
}
.page {
  max-width: 100%;
}

/* Header */
.doc-title {
  font-size: 18pt;
  font-weight: bold;
  margin-bottom: 8px;
}
.doc-info {
  font-size: 9pt;
  line-height: 1.6;
  margin-bottom: 16px;
}

/* Category */
.category-section {
  margin-bottom: 16px;
}
.cat-title {
  font-size: 11pt;
  font-weight: bold;
  margin-bottom: 6px;
  margin-top: 12px;
}

/* Table */
table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 4px;
}
th, td {
  border: 1px solid #000;
  padding: 4px 6px;
  vertical-align: top;
  font-size: 8.5pt;
  line-height: 1.35;
}
th {
  background: #fff;
  font-weight: bold;
  text-align: center;
  font-size: 8.5pt;
}

/* Column widths */
.col-case { width: 10%; }
.col-propno { width: 5%; text-align: center; }
.col-location { width: 40%; }
.col-usage { width: 8%; text-align: center; }
.col-price { width: 15%; text-align: right; }
.col-remarks { width: 22%; }

td.col-case {
  font-size: 8pt;
  word-break: break-all;
}
td.col-location {
  font-size: 8pt;
  word-break: break-all;
}
td.col-price {
  font-size: 8pt;
  text-align: right;
  white-space: nowrap;
}
td.col-remarks {
  font-size: 7.5pt;
  word-break: break-all;
}
td.col-usage {
  font-size: 8pt;
}
</style>
</head>
<body>
<div class="page">
  <div class="doc-title">법원 경매부동산의 매각 공고</div>
  <div class="doc-info">
    법원 경매부동산의 매각 공고<br/>
    1.매각물건의 표시 및 매각조건 &lt;${header.department || ''}&gt;<br/>
    매각일시 : ${header.saleDate || ''}<br/>
    매각결정기일 : ${header.saleDecisionDate || ''}
  </div>

  ${categoriesHTML}
</div>
</body>
</html>`;
}
