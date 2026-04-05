import { validateHwp } from '../../formats/hwp/validator';
import { handleError } from '../../cli/error-handler';
import { formatOutput } from '../../cli/output';
import { checkViewerCorruption } from '../../shared/viewer';
export async function validateCommand(file, options) {
    try {
        const result = await validateHwp(file);
        if (shouldRunViewerCheck(result)) {
            const viewerCheck = await runViewerCheck(file);
            result.checks.push(viewerCheck);
            result.valid = result.checks.every((c) => c.status !== 'fail');
        }
        process.stdout.write(formatOutput(result, options.pretty) + '\n');
        if (!result.valid) {
            process.exit(1);
        }
    }
    catch (e) {
        handleError(e);
    }
}
async function runViewerCheck(filePath) {
    const result = await checkViewerCorruption(filePath);
    if (result.skipped) {
        return { name: 'viewer', status: 'skip', message: 'Hancom Office HWP Viewer not found' };
    }
    if (result.corrupted) {
        return {
            name: 'viewer',
            status: 'fail',
            message: 'Hancom Office HWP Viewer detected corruption',
            details: result.alert ? { alert: result.alert } : undefined,
        };
    }
    return { name: 'viewer', status: 'pass' };
}
function shouldRunViewerCheck(result) {
    return result.format === 'hwp' && !result.checks.some((check) => check.status === 'fail');
}
//# sourceMappingURL=validate.js.map