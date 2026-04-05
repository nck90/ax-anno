import type { HwpDocument } from '../../../sdk/types';
export declare function loadHwp(fileBuffer: Uint8Array): Promise<HwpDocument>;
export declare function loadHwpSectionTexts(fileBuffer: Uint8Array): Promise<string[]>;
export declare function extractParaText(data: Buffer): string;
//# sourceMappingURL=reader.d.ts.map