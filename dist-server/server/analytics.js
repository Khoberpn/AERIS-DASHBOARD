export function powerFromVI(voltage, current) {
    if (!Number.isFinite(voltage) || !Number.isFinite(current) || voltage < 0 || current < 0)
        throw new RangeError('Voltage and current must be finite and non-negative');
    return Math.round(voltage * current * 1_000_000) / 1_000_000;
}
export function percentChange(treatmentPower, controlPower) {
    if (!Number.isFinite(treatmentPower) || !Number.isFinite(controlPower) || treatmentPower < 0 || controlPower < 0)
        throw new RangeError('Power must be finite and non-negative');
    if (controlPower === 0)
        return null;
    return ((treatmentPower - controlPower) / controlPower) * 100;
}
