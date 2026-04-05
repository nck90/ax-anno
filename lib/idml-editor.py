#!/usr/bin/env python3
"""IDML 템플릿의 Story 텍스트를 교체하는 스크립트.

Usage: python3 idml-editor.py <template.idml> <edited.json> <output.idml>
"""

import sys, json, zipfile, os, re, copy
from lxml import etree

# 카테고리 → Story 파일 매핑 (템플릿에서 분석한 결과)
CATEGORY_STORY_MAP = {
    "아파트": "Stories/Story_u4114.xml",
    "단독주택,다가구주택": "Stories/Story_u40fd.xml",
    "대지/임야/전답": "Stories/Story_u412b.xml",
    "기타": "Stories/Story_u4142.xml",
}


def find_table(root):
    """Story XML에서 Table 엘리먼트 찾기"""
    for elem in root.iter('Table'):
        return elem
    return None


def find_cells(table):
    """테이블의 모든 Cell을 (col, row) 순서로 반환"""
    cells = []
    for cell in table.iter('Cell'):
        name = cell.get('Name', '0:0')
        parts = name.split(':')
        col, row = int(parts[0]), int(parts[1])
        cells.append((col, row, cell))
    return cells


def get_cell_by_pos(cells, col, row):
    """특정 위치의 셀 찾기"""
    for c, r, cell in cells:
        if c == col and r == row:
            return cell
    return None


def set_cell_text(cell, text, multiline=False):
    """셀의 Content 텍스트 교체"""
    # 기존 Content 찾기
    contents = list(cell.iter('Content'))
    if not contents:
        return

    if multiline and '\n' in text:
        lines = text.split('\n')
        # 첫 번째 Content에 첫 줄
        contents[0].text = lines[0]
        # 나머지 줄은 Br + Content 추가 (기존 구조 유지)
        # 기존 추가 Content/Br 제거
        parent = contents[0].getparent()
        for c in contents[1:]:
            p = c.getparent()
            if p is not None:
                # Br 형제도 제거
                prev = c.getprevious()
                if prev is not None and prev.tag == 'Br':
                    p.remove(prev)
                p.remove(c)
        # 새 줄 추가
        for line in lines[1:]:
            br = etree.SubElement(parent, 'Br')
            content = etree.SubElement(parent, 'Content')
            content.text = line
    else:
        contents[0].text = text
        # 나머지 Content 비우기
        for c in contents[1:]:
            c.text = ''


def clone_row(table, template_row_idx, new_row_idx, cells):
    """기존 행을 복제하여 새 행 생성"""
    # Row 엘리먼트 복제
    rows = list(table.iter('Row'))
    if template_row_idx >= len(rows):
        return

    template_row = rows[template_row_idx]
    new_row = copy.deepcopy(template_row)
    new_row.set('Self', f'{table.get("Self")}Row{new_row_idx}')
    new_row.set('Name', str(new_row_idx))
    table.append(new_row)

    # 해당 행의 Cell 복제
    template_cells = [(c, r, cell) for c, r, cell in cells if r == template_row_idx]
    for col, _, tcell in template_cells:
        new_cell = copy.deepcopy(tcell)
        new_cell.set('Name', f'{col}:{new_row_idx}')
        new_cell.set('Self', re.sub(r'i\w+$', f'i{new_row_idx}c{col}', new_cell.get('Self', '')))
        # RowSpan 리셋
        new_cell.set('RowSpan', '1')
        table.append(new_cell)


def build_rows_from_category(category_data):
    """카테고리 데이터에서 테이블 행 데이터 생성"""
    rows = []
    for item in category_data.get('items', []):
        case_num = item['caseNumber']
        dup = item.get('duplicateInfo', '')
        if dup:
            case_num += '\n' + dup

        props = item.get('properties', [])
        for i, prop in enumerate(props):
            rows.append({
                'case_num': case_num if i == 0 else '',
                'case_rowspan': len(props) if i == 0 else 0,
                'prop_num': prop.get('propertyNumber', ''),
                'location': prop.get('location', ''),
                'usage': prop.get('usage', ''),
                'price': f"{prop.get('appraisalPrice', '')}\n{prop.get('minimumPrice', '')}" if prop.get('appraisalPrice') else '',
                'remarks': prop.get('remarks', ''),
            })
    return rows


def update_story(story_xml_bytes, category_data):
    """Story XML의 테이블 내용을 교체"""
    root = etree.fromstring(story_xml_bytes)
    table = find_table(root)
    if table is None:
        return story_xml_bytes  # 테이블 없으면 변경 없음

    cells = find_cells(table)
    if not cells:
        return story_xml_bytes

    # 기존 행 수 파악
    max_row = max(r for _, r, _ in cells)

    # 새 데이터 행 생성
    new_rows = build_rows_from_category(category_data)

    if not new_rows:
        return story_xml_bytes

    # 기존 셀에 데이터 채우기 (있는 만큼)
    for row_idx, row_data in enumerate(new_rows):
        if row_idx > max_row:
            break  # 템플릿 행 수 초과 시 중단

        # 사건번호 (col 0)
        cell = get_cell_by_pos(cells, 0, row_idx)
        if cell is not None:
            if row_data['case_num']:
                set_cell_text(cell, row_data['case_num'], multiline=True)
                if row_data['case_rowspan'] > 1:
                    cell.set('RowSpan', str(row_data['case_rowspan']))
            else:
                # rowspan에 의해 병합된 셀 - 비우기
                set_cell_text(cell, '')

        # 물건번호 (col 1)
        cell = get_cell_by_pos(cells, 1, row_idx)
        if cell is not None:
            set_cell_text(cell, row_data['prop_num'])

        # 소재지 (col 2)
        cell = get_cell_by_pos(cells, 2, row_idx)
        if cell is not None:
            set_cell_text(cell, row_data['location'])

        # 용도 (col 3)
        cell = get_cell_by_pos(cells, 3, row_idx)
        if cell is not None:
            set_cell_text(cell, row_data['usage'])

        # 가격 (col 4)
        cell = get_cell_by_pos(cells, 4, row_idx)
        if cell is not None:
            set_cell_text(cell, row_data['price'], multiline=True)

        # 비고 (col 5)
        cell = get_cell_by_pos(cells, 5, row_idx)
        if cell is not None:
            set_cell_text(cell, row_data['remarks'])

    # 남은 기존 행 비우기
    for row_idx in range(len(new_rows), max_row + 1):
        for col in range(6):
            cell = get_cell_by_pos(cells, col, row_idx)
            if cell is not None:
                set_cell_text(cell, '')

    return etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone='yes')


def replace_text_in_story(story_xml_bytes, replacements):
    """Story XML 내의 Content 텍스트에서 문자열 치환"""
    root = etree.fromstring(story_xml_bytes)
    changed = False
    for content in root.iter('Content'):
        if content.text:
            for old, new in replacements.items():
                if old and new and old in content.text:
                    content.text = content.text.replace(old, new)
                    changed = True
    if not changed:
        return story_xml_bytes
    return etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone='yes')


def edit_idml(template_path, edited_json_path, output_path):
    """IDML 템플릿을 편집된 데이터로 업데이트"""
    with open(edited_json_path, 'r', encoding='utf-8') as f:
        edited = json.load(f)

    header = edited.get('header', {})

    # 카테고리별 데이터 매핑
    cat_data = {}
    for cat in edited.get('categories', []):
        cat_data[cat['name']] = cat

    # 헤더/풋터 텍스트 치환 맵 (템플릿 기본값 → 실제 값)
    header_replacements = {}
    dept = header.get('department', '')
    court = header.get('court', '')
    sale_date = header.get('saleDate', '')
    decision_date = header.get('saleDecisionDate', '')
    judge = header.get('judge', '')
    publish_date = header.get('publishDate', '')

    if dept:
        header_replacements['경매2계'] = dept
        # <경매 2계> 형태도 치환
        old_num = re.search(r'경매(\d+)계', '경매2계')
        new_num = re.search(r'경매(\d+)계', dept)
        if old_num and new_num:
            header_replacements[f'경매 {old_num.group(1)}계'] = f'경매 {new_num.group(1)}계'
    if court:
        header_replacements['청주지방법원 제천지원'] = court

    # 헤더/풋터 Story 파일 (템플릿 분석 결과)
    HEADER_STORIES = [
        "Stories/Story_u421c.xml",  # 하단: 매각기일, 법원명, 사법보좌관
        "Stories/Story_ua16.xml",   # <경매N계> 표시
        "Stories/Story_u96f.xml",   # 제목
    ]

    # IDML ZIP 복사 및 수정
    with zipfile.ZipFile(template_path, 'r') as zin:
        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                data = zin.read(item.filename)

                # Story 파일이면 해당 카테고리 데이터로 교체
                edited_this = False
                for cat_name, story_file in CATEGORY_STORY_MAP.items():
                    if item.filename == story_file and cat_name in cat_data:
                        data = update_story(data, cat_data[cat_name])
                        edited_this = True
                        break

                # 헤더/풋터 Story에서 텍스트 치환
                if not edited_this and item.filename in HEADER_STORIES and header_replacements:
                    data = replace_text_in_story(data, header_replacements)

                # 모든 Story에서 헤더 치환 시도 (누락 방지)
                if item.filename.startswith('Stories/') and header_replacements:
                    if not edited_this:
                        data = replace_text_in_story(data, header_replacements)

                zout.writestr(item, data)

    print(f"IDML saved: {output_path}")


if __name__ == '__main__':
    if len(sys.argv) != 4:
        print("Usage: python3 idml-editor.py <template.idml> <edited.json> <output.idml>")
        sys.exit(1)
    edit_idml(sys.argv[1], sys.argv[2], sys.argv[3])
