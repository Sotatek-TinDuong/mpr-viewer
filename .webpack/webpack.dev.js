/**
 * vtkRules contains three rules:
 *
 * - shader-loader
 * - babel-loader
 * - worker-loader
 *
 * The defaults work fine for us here, but it's worth noting that for a UMD build,
 * we would like likely want to inline web workers. An application consuming this package
 * will likely want to use a non-default loader option:
 *
 * {
 *   test: /\.worker\.js$/,
 *   include: /vtk\.js[\/\\]Sources/,
 *   use: [
 *     {
 *       loader: 'worker-loader',
 *       options: { inline: true, fallback: false },
 *     },
 *   ],
 * },
 */
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const path = require('path');
const webpack = require('webpack');
const autoprefixer = require('autoprefixer');
const vtkRules = require('vtk.js/Utilities/config/dependency.js').webpack.core
  .rules;
// Plugins
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const ENTRY_VTK_EXT = path.join(__dirname, './../src/index.js');
const ENTRY_EXAMPLES = path.join(__dirname, './../examples/index.js');
const SRC_PATH = path.join(__dirname, './../src');
const OUT_PATH = path.join(__dirname, './../dist');
const scss = path.join(__dirname, './../src/sass/style.scss');
const dotenv = require('dotenv');
// call dotenv and it will return an Object with a parsed key
const env = dotenv.config().parsed;
// reduce it to a nice object, the same as before
const envKeys = Object.keys(env).reduce((prev, next) => {
  prev[`process.env.${next}`] = JSON.stringify(env[next]);
  return prev;
}, {});

module.exports = {
  optimization: {
    minimizer: [new OptimizeCSSAssetsPlugin({})],
  },
  entry: [
    ENTRY_EXAMPLES,
    scss
  ],
  devtool: 'source-map',
  output: {
    path: OUT_PATH,
    filename: '[name].bundle.[hash].js',
    library: 'ReactVTKjsViewport',
    libraryTarget: 'umd',
    globalObject: 'this',
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: ['babel-loader'],
      },
      {
        test: /\.scss$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader',
          'sass-loader'
        ]
      },
      {
        test: /\.css$/,
        exclude: /\.module\.css$/,
        use: [
          'style-loader',
          'css-loader',
          {
            loader: 'postcss-loader',
            options: {
              plugins: () => [autoprefixer('last 2 version', 'ie >= 10')],
            },
          },
        ],
      },
    ].concat(vtkRules),
  },
  resolve: {
    modules: [path.resolve(__dirname, './../node_modules'), SRC_PATH],
    alias: {
      '@vtk-viewport': ENTRY_VTK_EXT,
    },
  },
  plugins: [
    new MiniCssExtractPlugin({
      style: '../public/css/style.min.css',
    }),
    // Show build progress
    new webpack.ProgressPlugin(),
    // Clear dist between builds
    new CleanWebpackPlugin(),
    // Generate `index.html` with injected build assets
    new HtmlWebpackPlugin({
      filename: 'index.html',
      template: path.resolve(__dirname, '..', 'public', 'index.html'),
    }),
    // Copy "Public" Folder to Dist (test data)
    new CopyWebpackPlugin([
      {
        from: path.resolve(__dirname, '..', 'public'),
        to: OUT_PATH,
        toType: 'dir',
        ignore: ['index.html', '.DS_Store'],
      },
    ]),
    new webpack.DefinePlugin(envKeys),
  ],
  // Fix for `cornerstone-wado-image-loader` fs dep
  node: { fs: 'empty' },
  devServer: {
    host: '0.0.0.0',
    hot: true,
    open: true,
    port: 3001,
    historyApiFallback: true,
  },
};
