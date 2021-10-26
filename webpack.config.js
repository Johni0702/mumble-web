var theme = '../themes/MetroMumbleLight'
var path = require('path');
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin")

module.exports = {
  plugins: [
    new NodePolyfillPlugin()
  ],
  mode: 'development',
  entry: {
    index: [
      './app/index.js',
      './app/index.html'
    ],
    config: './app/config.js',
    theme: './app/theme.js',
    matrix: './app/matrix.js'
  },
  devtool: "cheap-source-map",
  output: {
    path: path.join(__dirname, 'dist'),
    chunkFilename: '[chunkhash].js',
    filename: '[name].js',
    publicPath: ''
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /(node_modules)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
            plugins: ['@babel/plugin-transform-runtime']
          }
        }
      },
      {
        test: /\.html$/,
        use: [
          {
            loader: 'file-loader',
            options: {
              esModule: false,
              'name': '[name].[ext]'
            }
          },
          {
            loader: "extract-loader"
          },
          {
            loader: 'html-loader',
            options: {
              attrs: ['img:src', 'link:href'],
              root: theme
            }
          }
        ]
      },
      {
        test: /\.css$/,
        use: [
          {
            loader: 'file-loader',
            options: {
              esModule: false,
            },
          },
          'extract-loader',
          'css-loader'
        ]
      },
      {
        test: /\.scss$/,
        use: [
          {
            loader: 'file-loader',
            options: {
              esModule: false,
              name: '[contenthash].css'
            },
          },
          'extract-loader',
          'css-loader',
          'sass-loader'
        ]
      },
      {
        type: 'javascript/auto',
        test: /manifest\.json$|\.xml$/,
        use: [
          {
            loader: 'file-loader',
            options: {
              esModule: false,
            },
          },
          'extract-loader',
          {
            loader: 'regexp-replace-loader',
            options: {
              match: {
                pattern: "#require\\('([^']*)'\\)",
                flags: 'g'
              },
              replaceWith: '"+require("$1")+"'
            }
          },
          'raw-loader'
        ]
      },
      {
        test: /\.(svg|png|ico)$/,
        use: [
          {
            loader: 'file-loader',
            options: {
              esModule: false,
              name: '[contenthash].[ext]'
            }
          }
        ]
      },
      {
        test: /worker\.js$/,
        use: { loader: 'worker-loader' }
      },
      {
        enforce: 'post',
        test: /mumble-streams\/lib\/data.js/,
        use: [
          'transform-loader?brfs'
        ]
      }
    ]
  },
  target: 'web'
}
