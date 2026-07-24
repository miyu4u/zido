import { haversineDistance } from './haversine'

describe('haversineDistance', () => {
  it('동일한 좌표 사이의 거리를 0미터로 계산한다', () => {
    expect(haversineDistance(37.5, 127, 37.5, 127)).toBe(0)
  })

  it('적도에서 위도 1도 차이를 약 111.195킬로미터로 계산한다', () => {
    expect(haversineDistance(0, 0, 1, 0)).toBeCloseTo(111_195, 0)
  })

  it('좌표 순서를 바꾸어도 동일한 거리를 반환한다', () => {
    const distanceFromFirstToSecond = haversineDistance(37.5, 127, 37.501, 127.002)
    const distanceFromSecondToFirst = haversineDistance(37.501, 127.002, 37.5, 127)

    expect(distanceFromFirstToSecond).toBeCloseTo(distanceFromSecondToFirst, 10)
  })
})
