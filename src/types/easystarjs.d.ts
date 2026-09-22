declare module 'easystarjs' {
  export class js {
    constructor();
    setGrid(grid: number[][]): void;
    setAcceptableTiles(tiles: number[]): void;
    enableDiagonals(): void;
    disableDiagonals(): void;
    setIterationsPerCalculation(iterations: number): void;
    findPath(
      startX: number,
      startY: number,
      endX: number,
      endY: number,
      callback: (path: { x: number; y: number }[] | null) => void
    ): void;
    calculate(): void;
    avoidAdditionalPoint(x: number, y: number): void;
    stopAvoidingAdditionalPoint(x: number, y: number): void;
    stopAvoidingAllAdditionalPoints(): void;
  }
  const defaultExport: typeof js;
  export default defaultExport;
}

declare module '*.md?raw' {
  const markdown: string;
  export default markdown;
}
