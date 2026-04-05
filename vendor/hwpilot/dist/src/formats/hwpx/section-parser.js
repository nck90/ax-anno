import { XMLParser } from 'fast-xml-parser';
import { buildRef } from '../../shared/refs';
const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: true,
    trimValues: false,
    isArray: (name) => ['hp:p', 'hp:run', 'hp:tbl', 'hp:tr', 'hp:tc', 'hp:pic', 'hp:rect'].includes(name),
});
/**
 * Recursively collect <hp:tbl> elements nested inside paragraphs.
 * HWPML nesting varies by document:
 *   - <hp:p> → <hp:run> → <hp:tbl>  (most common in court auction HWPX)
 *   - <hp:p> → <hp:ctrl> → <hp:tbl> (alternative nesting)
 *   - <hp:p> → <hp:tbl>             (direct child)
 */
function collectNestedTables(node) {
    const tables = [];
    // Check <hp:run> children (most common path: <p> → <run> → <tbl>)
    for (const run of asArray(node['hp:run'])) {
        tables.push(...asArray(run['hp:tbl']));
    }
    // Check <hp:ctrl> children (alternative path: <p> → <ctrl> → <tbl>)
    for (const ctrl of asArray(node['hp:ctrl'])) {
        tables.push(...asArray(ctrl['hp:tbl']));
        const subList = ctrl['hp:subList'];
        if (subList && typeof subList === 'object') {
            for (const subP of asArray(subList['hp:p'])) {
                tables.push(...collectNestedTables(subP));
            }
        }
    }
    // Direct <hp:tbl> children
    tables.push(...asArray(node['hp:tbl']));
    return tables;
}
export function parseSection(xml, sectionIndex) {
    const parsed = parser.parse(xml);
    const sec = (parsed['hs:sec'] ?? {});
    const rawParagraphs = asArray(sec['hp:p']);
    const rawTables = asArray(sec['hp:tbl']);
    const rawPics = asArray(sec['hp:pic']);
    const sectionRects = asArray(sec['hp:rect']);
    const inlineRects = rawParagraphs.flatMap((paragraph) => asArray(paragraph['hp:rect']));
    const rawRects = [...sectionRects, ...inlineRects];
    // Tables may be nested inside paragraphs as <hp:p> → <hp:ctrl> → <hp:tbl>
    // Collect them recursively from all paragraphs
    const inlineTables = rawParagraphs.flatMap((paragraph) => collectNestedTables(paragraph));
    const allRawTables = [...rawTables, ...inlineTables];
    const paragraphs = rawParagraphs.map((paragraph, paragraphIndex) => parseParagraph(paragraph, {
        section: sectionIndex,
        paragraph: paragraphIndex,
    }));
    const tables = allRawTables.map((table, tableIndex) => parseTable(table, sectionIndex, tableIndex));
    const images = rawPics.map((pic, imageIndex) => parseImage(pic, sectionIndex, imageIndex));
    const textBoxes = rawRects
        .map((rect, textBoxIndex) => parseTextBox(rect, sectionIndex, textBoxIndex))
        .filter((textBox) => textBox !== null);
    return {
        paragraphs,
        tables,
        images,
        textBoxes,
    };
}
export async function parseSections(archive) {
    const sectionCount = archive.getSectionCount();
    const sections = [];
    for (let i = 0; i < sectionCount; i++) {
        const xml = await archive.getSectionXml(i);
        sections.push(parseSection(xml, i));
    }
    return sections;
}
function parseParagraph(paragraph, refParts) {
    const runs = asArray(paragraph['hp:run']).map(parseRun);
    return {
        ref: buildRef(refParts),
        runs,
        paraShapeRef: asNumber(paragraph['hp:paraPrIDRef'], 0),
        styleRef: asNumber(paragraph['hp:styleIDRef'], 0),
    };
}
function parseTextBox(rect, sectionIndex, textBoxIndex) {
    const drawText = rect['hp:drawText'];
    if (!drawText || typeof drawText !== 'object') {
        return null;
    }
    const subList = drawText['hp:subList'];
    if (!subList || typeof subList !== 'object') {
        return null;
    }
    const paragraphs = asArray(subList['hp:p']).map((paragraph, paragraphIndex) => parseParagraph(paragraph, {
        section: sectionIndex,
        textBox: textBoxIndex,
        textBoxParagraph: paragraphIndex,
    }));
    return {
        ref: buildRef({ section: sectionIndex, textBox: textBoxIndex }),
        paragraphs,
    };
}
function parseRun(run) {
    return {
        text: extractText(run['hp:t']),
        charShapeRef: asNumber(run['hp:charPrIDRef'], 0),
    };
}
function parseTable(table, sectionIndex, tableIndex) {
    const rows = asArray(table['hp:tr']).map((row, rowIndex) => parseTableRow(row, sectionIndex, tableIndex, rowIndex));
    return {
        ref: buildRef({ section: sectionIndex, table: tableIndex }),
        rows,
    };
}
function parseTableRow(row, sectionIndex, tableIndex, rowIndex) {
    const cells = asArray(row['hp:tc']).map((cell, cellIndex) => parseTableCell(cell, sectionIndex, tableIndex, rowIndex, cellIndex));
    return { cells };
}
function parseTableCell(cell, sectionIndex, tableIndex, rowIndex, cellIndex) {
    const span = (cell['hp:cellSpan'] ?? {});
    const rawParagraphs = asArray(cell['hp:p']);
    const paragraphs = rawParagraphs.map((paragraph, paragraphIndex) => parseParagraph(paragraph, {
        section: sectionIndex,
        table: tableIndex,
        row: rowIndex,
        cell: cellIndex,
        cellParagraph: paragraphIndex,
    }));
    return {
        ref: buildRef({ section: sectionIndex, table: tableIndex, row: rowIndex, cell: cellIndex }),
        paragraphs,
        colSpan: asNumber(span['hp:colSpan'], 1),
        rowSpan: asNumber(span['hp:rowSpan'], 1),
    };
}
function parseImage(pic, sectionIndex, imageIndex) {
    const width = asNumber(pic['hp:width'], 0);
    const height = asNumber(pic['hp:height'], 0);
    const format = asString(pic['hp:format']);
    const directPath = asString(pic['hp:binDataPath']);
    const binDataPath = directPath || deriveBinDataPath(pic);
    return {
        ref: buildRef({ section: sectionIndex, image: imageIndex }),
        binDataPath,
        width,
        height,
        format,
    };
}
function deriveBinDataPath(pic) {
    const idRef = asString(pic['hp:binDataIDRef']);
    if (idRef) {
        return `BinData/${idRef}`;
    }
    const id = asString(pic['hp:id']);
    if (id) {
        return `BinData/${id}`;
    }
    return '';
}
function extractText(value) {
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'number') {
        return String(value);
    }
    if (value && typeof value === 'object') {
        const text = value['#text'];
        return typeof text === 'string' ? text : typeof text === 'number' ? String(text) : '';
    }
    return '';
}
function asArray(value) {
    if (Array.isArray(value)) {
        return value;
    }
    if (value === undefined || value === null) {
        return [];
    }
    return [value];
}
function asNumber(value, fallback) {
    return typeof value === 'number' ? value : fallback;
}
function asString(value) {
    return typeof value === 'string' ? value : '';
}
//# sourceMappingURL=section-parser.js.map