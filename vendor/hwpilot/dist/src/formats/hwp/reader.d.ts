import { extractParaText } from '../../sdk/formats/hwp/reader';
import type { HwpDocument } from '../../sdk/types';
export { extractParaText };
export declare function loadHwp(filePath: string): Promise<HwpDocument>;
export declare function loadHwpSectionTexts(filePath: string): Promise<string[]>;
//# sourceMappingURL=reader.d.ts.map