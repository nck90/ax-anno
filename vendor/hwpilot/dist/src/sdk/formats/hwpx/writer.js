import { loadHwpx } from './loader';
import { mutateHwpxZip } from './mutator';
export async function editHwpx(fileBuffer, operations) {
    if (operations.length === 0) {
        return fileBuffer;
    }
    const archive = await loadHwpx(fileBuffer);
    const zip = archive.getZip();
    await mutateHwpxZip(zip, archive, operations);
    return zip.generateAsync({ type: 'uint8array' });
}
//# sourceMappingURL=writer.js.map