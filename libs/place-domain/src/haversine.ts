/**
* 지구 반지름 (meter)
* 평균적으로 약 6,371km (= 6,371,000m)로 간주되며, 하버사인 공식의 거리 단위 기준이 됨.
*/
const EARTH_RADIUS_IN_METERS = 6371000;
/**
 * 두 좌표 간 거리를 미터 단위로 계산
 * @param latitudeOfFirstPoint 첫 번째 좌표의 위도
 * @param longitudeOfFirstPoint 첫 번째 좌표의 경도
 * @param latitudeOfSecondPoint 두 번째 좌표의 위도
 * @param longitudeOfSecondPoint 두 번째 좌표의 경도
 * @returns 거리 (미터)
 */
export function haversineDistance(
    latitudeOfFirstPoint: number,
    longitudeOfFirstPoint: number,
    latitudeOfSecondPoint: number,
    longitudeOfSecondPoint: number
): number {


    /**
     * 두 위도 간의 차이(Δlat)를 라디안(radian)으로 변환
     * 하버사인 공식에서 위도 차이는 반드시 라디안으로 입력되어야 한다.
     */
    const differenceInLatitude = convertDegreesToRadians(latitudeOfSecondPoint - latitudeOfFirstPoint);

    /**
     * 두 경도 간의 차이(Δlon)를 라디안(radian)으로 변환
     * 하버사인 공식에서 경도 차이 역시 라디안 단위가 필요하다.
     */
    const differenceInLongitude = convertDegreesToRadians(longitudeOfSecondPoint - longitudeOfFirstPoint);

    /**
     * 위도 차이의 절반에 대한 사인값
     * 하버사인 공식의 중간 계산값으로 사용됨
     */
    const sinDeltaLatOver2 = Math.sin(differenceInLatitude / 2);
    
    /**
     * 경도 차이의 절반에 대한 사인값
     * 하버사인 공식의 중간 계산값으로 사용됨
     */
    const sinDeltaLonOver2 = Math.sin(differenceInLongitude / 2);
    
    /**
     * 첫 번째 좌표의 위도에 대한 코사인값
     * 하버사인 공식에서 구면 삼각법 계산에 필요
     */
    const cosLat1 = Math.cos(convertDegreesToRadians(latitudeOfFirstPoint));
    
    /**
     * 두 번째 좌표의 위도에 대한 코사인값
     * 하버사인 공식에서 구면 삼각법 계산에 필요
     */
    const cosLat2 = Math.cos(convertDegreesToRadians(latitudeOfSecondPoint));

    /**
     * 하버사인 공식의 중간 계산값 (a)
     * sin²(Δlat/2) + cos(lat1) * cos(lat2) * sin²(Δlon/2)
     * 이 값은 중심각(central angle) 계산에 사용됨
     */
    const a =
        sinDeltaLatOver2 * sinDeltaLatOver2 +
        cosLat1 * cosLat2 * sinDeltaLonOver2 * sinDeltaLonOver2;

    const centralAngle = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return EARTH_RADIUS_IN_METERS * centralAngle;
}

/**
 * 각도를 라디안으로 변환
 */
function convertDegreesToRadians(degreeValue: number): number {
    return degreeValue * (Math.PI / 180);
}
