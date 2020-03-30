var theme = '../themes/MetroMumbleLight'
var path = require('path');

module.exports = {
  mode: 'development',
  entry: {
    index: [
      './app/index.js',
      './app/index.html'
    ],
    config: './app/config.js'
  },
  output: {
    path: path.join(__dirname, 'dist'),
    filename: '[name].js'
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
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
            options: { 'name': '[name].[ext]' }
          },
          {
            loader: "extract-loader"
          },
          {
            loader: 'html-loader',
            options: {
              attrs: ['img:src', 'link:href'],
              //interpolate: 'require',
              root: theme
            }
          }
        ]
      },
      {
        test: /\.css$/,
        use: [
          'file-loader',
          'extract-loader',
          'css-loader'
        ]
      },
      {
        type: 'javascript/auto',
        test: /manifest\.json$|\.xml$/,
        use: [
          'file-loader',
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
          'file-loader'
        ]
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
  resolve: {
    alias: {
      webworkify: 'webworkify-webpack'
    }
  },
  target: 'web'
}
