/** Parameters of the illustrative epoch field. Not derived from any observation. */
export const SIM_EPOCHS = [0, 0.5, 1];
export const SIM_MOVER_SHIFT_PX = 1.9;

export const simulatedBrightness = (epoch: number) => 0.38 + 0.62 * Math.sin(epoch * Math.PI * 0.5);

export function simulatedReadout(epoch: number) {
  return {
    shiftPx: SIM_MOVER_SHIFT_PX * epoch,
    brightnessPct: (simulatedBrightness(epoch) / simulatedBrightness(0) - 1) * 100,
  };
}
