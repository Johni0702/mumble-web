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
          'file-loader?name=[name].[ext]',
          'extract-loader',
          'html-loader?' + JSON.stringify({
            attrs: ['img:src', 'link:href'],
            interpolate: 'require'
          })
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
        test: /manifest\.json$|\.xml$/,
        use: [
          'file-loader',
          'extract-loader',
          'regexp-replace-loader?' + JSON.stringify({
            match: {
              pattern: "#require\\('([^']*)'\\)",
              flags: 'g'
            },
            replaceWith: '"+require("$1")+"'
          }),
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
