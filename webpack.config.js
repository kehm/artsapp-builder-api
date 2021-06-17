const nodeExternals = require('webpack-node-externals');
const Dotenv = require('dotenv-webpack');
const path = require('path');

module.exports = {
    entry: {
        app: './src/app.js',
    },
    output: {
        path: path.resolve(__dirname, 'build'),
        filename: 'app.bundle.js',
    },
    externalsPresets: { node: true },
    externals: [nodeExternals()],
    module: {
        rules: [
            {
                test: /\.m?js$/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: [
                            '@babel/preset-env',
                        ],
                    },
                },
            },
        ],
    },
    plugins: [
        new Dotenv(),
    ],
};
