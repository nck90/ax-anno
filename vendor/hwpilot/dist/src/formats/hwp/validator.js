import { readFile } from 'node:fs/promises';
import { validateHwp as sdkValidateHwp, validateHwpBuffer } from '../../sdk/formats/hwp/validator';
export { validateHwpBuffer };
export async function validateHwp(filePath) {
    const buffer = await readFile(filePath);
    const result = await sdkValidateHwp(buffer);
    result.file = filePath;
    return result;
}
//# sourceMappingURL=validator.js.map