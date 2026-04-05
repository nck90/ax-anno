import { type CreateHwpOptions } from '../sdk/formats/hwp/creator';
import type { EditOperation } from '../sdk/edit-types';
import type { HwpDocument } from '../sdk/types';
export declare function openFile(filePath: string): Promise<HwpDocument>;
export declare function editFile(filePath: string, operations: EditOperation[]): Promise<void>;
export declare function createHwpFile(filePath: string, options?: CreateHwpOptions): Promise<void>;
//# sourceMappingURL=index.d.ts.map