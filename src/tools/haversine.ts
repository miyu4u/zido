/**
 * 하버사인 공식을 사용한 두 좌표 간 거리 계산 (미터 단위)
 */

/**
 * 두 좌표 간 거리를 미터 단위로 계산
 * @param lat1 첫 번째 좌표의 위도
 * @param lng1 첫 번째 좌표의 경도
 * @param lat2 두 번째 좌표의 위도
 * @param lng2 두 번째 좌표의 경도
 * @returns 거리 (미터)
 */
export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000 // 지구 반지름 (미터)

    const dLat = toRadians(lat2 - lat1)
    const dLng = toRadians(lng2 - lng1)

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return R * c
}

/**
 * 각도를 라디안으로 변환
 */
function toRadians(degrees: number): number {
    return degrees * (Math.PI / 180)
}
