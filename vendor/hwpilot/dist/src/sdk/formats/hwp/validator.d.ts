export type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip';
export type CheckResult = {
    name: string;
    status: CheckStatus;
    message?: string;
    details?: Record<string, unknown>;
};
export type ValidateResult = {
    valid: boolean;
    format: 'hwp' | 'hwpx';
    file: string;
    checks: CheckResult[];
};
export declare function validateHwp(fileBuffer: Uint8Array): Promise<ValidateResult>;
export declare function validateHwpBuffer(buffer: Buffer): Promise<ValidateResult>;
//# sourceMappingURL=validator.d.ts.map