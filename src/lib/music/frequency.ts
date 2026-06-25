export function centsDifference(hzA: number, hzB: number): number {
  return 1200 * Math.log2(hzA / hzB)
}
