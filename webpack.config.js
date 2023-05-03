const { BannerPlugin } = require('webpack')
const webpackNodeExternals = require('webpack-node-externals')
const { WebpackPnpExternals } = require('webpack-pnp-externals')
const { resolve } = require('path')

const { default: DtsPlugin } = require('./packages/builder/src/plugins/DtsPlugin')

const rootPath = __dirname.replace(/\\/g, '/')
const resolvePath = subPath => resolve(rootPath, subPath).replace(/\\/g, '/')
// const getRelativePath = fullPath => fullPath.replace(/\\/g, '/').replace(rootPath, '')

const envName = process.env.NODE_ENV || 'development'

const entry = {
  '/packages/builder/cli/index.ts': {
    import: resolvePath('packages/builder/cli/index.ts')
  },
  '/packages/builder/src/lib/dts/index.ts': {
    import: resolvePath('packages/builder/src/lib/dts/index.ts')
  },
  '/packages/builder/src/lib/paths/index.ts': {
    import: resolvePath('packages/builder/src/lib/paths/index.ts')
  },
  '/packages/builder/src/plugins/DtsPlugin/index.ts': {
    import: resolvePath('packages/builder/src/plugins/DtsPlugin/index.ts')
  },
  '/packages/resolve/index.ts': {
    import: resolvePath('packages/resolve/index.ts')
  },
  '/packages/resolve/cli/index.ts': {
    import: resolvePath('packages/resolve/cli/index.ts')
  },
  '/packages/dummy/cli/index.ts': {
    import: resolvePath('packages/dummy/cli/index.ts')
  }
}

exports = module.exports = {
  entry,
  mode: envName,
  output: {
    path: rootPath,
    filename: data => {
      return data.chunk.name.replace(/\.tsx?$/, '.js') // change index.ts to index.js
    },
    library: {
      type: 'commonjs2'
    }
  },
  resolve: {
    extensions: [
      '.ts',
      '.js',
      '.tsx'
    ]
  },
  module: {
    rules: [
      {
        test: /\.(js|tsx?)$/,
        use: [
          {
            loader: require.resolve('ts-loader'),
            options: {
              configFile: resolvePath('./tsconfig.json'),
              compilerOptions: {
                projectDir: __dirname
              }
            }
          }
        ],
        exclude: /node_modules|\.yarn/
      }
    ]
  },
  plugins: [
    new BannerPlugin({
      banner ({ filename }) {
        return filename.includes('/cli/')
          ? '#!/usr/bin/env node'
          : ''
      },
      raw: true
    }),
    new DtsPlugin(rootPath)
  ],
  watch: envName === 'development',
  watchOptions: {
    ignored: [
      'node_modules',
      '.yarn',
      '**/index.js',
      '**/index.d.ts'
    ]
  },
  devtool: false,
  target: 'node',
  externals: [
    webpackNodeExternals(),
    WebpackPnpExternals()
  ],
  externalsPresets: {
    node: true
  }
}