import { type Rectangle, type Vector, type TimedVector, bezierCurve, bezierCurveSpeed } from './math'

export interface PathOptions {
  /**
   * Override the spread of the generated path.
   */
  readonly spreadOverride?: number
  /**
   * Speed of mouse movement.
   * Default is random.
   */
  readonly moveSpeed?: number

  /**
   * Generate timestamps for each point in the path.
   */
  readonly useTimestamps?: boolean
}

/**
 * Calculate the amount of time needed to move from (x1, y1) to (x2, y2)
 * given the width of the element being clicked on
 * https://en.wikipedia.org/wiki/Fitts%27s_law
 */
const fitts = (distance: number, width: number): number => {
  const a = 0
  const b = 2
  const id = Math.log2(distance / width + 1)
  return a + b * id
}

export function path (point: Vector, target: Vector, options?: number | PathOptions): Vector[] | TimedVector[]
export function path (point: Vector, target: Rectangle, options?: number | PathOptions): Vector[] | TimedVector[]
export function path (start: Vector, end: Rectangle | Vector, options?: number | PathOptions): Vector[] | TimedVector[] {
  const optionsResolved: PathOptions = typeof options === 'number'
    ? { spreadOverride: options }
    : { ...options }

  const DEFAULT_WIDTH = 100
  const MIN_STEPS = 25
  const width = 'width' in end && end.width !== 0 ? end.width : DEFAULT_WIDTH
  const curve = bezierCurve(start, end, optionsResolved.spreadOverride)
  const length = curve.length() * 0.8

  const speed = optionsResolved.moveSpeed !== undefined && optionsResolved.moveSpeed > 0
    ? (25 / optionsResolved.moveSpeed)
    : Math.random()
  const baseTime = speed * MIN_STEPS
  const steps = Math.ceil((Math.log2(fitts(length, width) + 1) + baseTime) * 3)
  const re = curve.getLUT(steps)
  return clampPositive(re, optionsResolved)
}

const clampPositive = (vectors: Vector[], options?: PathOptions): Vector[] | TimedVector[] => {
  const clampedVectors = vectors.map((vector) => ({
    x: Math.max(0, vector.x),
    y: Math.max(0, vector.y)
  }))

  return options?.useTimestamps === true ? generateTimestamps(clampedVectors, options) : clampedVectors
}

const generateTimestamps = (vectors: Vector[], options?: PathOptions): TimedVector[] => {
  const speed = options?.moveSpeed ?? (Math.random() * 0.5 + 0.5)
  const timeToMove = (P0: Vector, P1: Vector, P2: Vector, P3: Vector, samples: number): number => {
    let total = 0
    const dt = 1 / samples

    for (let t = 0; t < 1; t += dt) {
      const v1 = bezierCurveSpeed(t * dt, P0, P1, P2, P3)
      const v2 = bezierCurveSpeed(t, P0, P1, P2, P3)
      total += (v1 + v2) * dt / 2
    }

    return Math.round(total / speed)
  }

  const timedVectors: TimedVector[] = vectors.map((vector) => ({ ...vector, timestamp: 0 }))

  for (let i = 0; i < timedVectors.length; i++) {
    const P0 = i === 0 ? timedVectors[i] : timedVectors[i - 1]
    const P1 = timedVectors[i]
    const P2 = i === timedVectors.length - 1 ? timedVectors[i] : timedVectors[i + 1]
    const P3 = i === timedVectors.length - 1 ? timedVectors[i] : timedVectors[i + 1]
    const time = timeToMove(P0, P1, P2, P3, timedVectors.length)

    timedVectors[i] = {
      ...timedVectors[i],
      timestamp: i === 0 ? Date.now() : timedVectors[i - 1].timestamp + time
    }
  }

  return timedVectors
}
