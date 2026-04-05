import type { Section } from '../../../sdk/types';
import type { HwpxArchive } from './loader';
export declare function parseSection(xml: string, sectionIndex: number): Section;
export declare function parseSections(archive: HwpxArchive): Promise<Section[]>;
//# sourceMappingURL=section-parser.d.ts.map