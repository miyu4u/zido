const path = require('node:path')

/**
 * TypeScript path mapping과 동일한 library alias를 Nest webpack build에 연결합니다.
 *
 * @param {import('webpack').Configuration} options Nest CLI가 생성한 기본 webpack configuration입니다.
 * @returns {import('webpack').Configuration} application bundle에서 workspace library를 해석하는 configuration입니다.
 */
module.exports = function configureWebpack(options) {
    return {
        ...options,
        resolve: {
            ...options.resolve,
            alias: {
                ...options.resolve?.alias,
                'zido/common': path.resolve(__dirname, 'libs/common/src'),
                'zido/map-providers': path.resolve(__dirname, 'libs/map-providers/src'),
                'zido/mcp-runtime': path.resolve(__dirname, 'libs/mcp-runtime/src'),
                'zido/place-domain': path.resolve(__dirname, 'libs/place-domain/src'),
            },
        },
    }
}
