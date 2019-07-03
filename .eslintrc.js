module.exports = {
    'env': {
        'browser': true,
        'commonjs': true,
        'es6': true
    },
    'extends': 'eslint:recommended',
    'globals': {
        'Atomics': 'readonly',
        'SharedArrayBuffer': 'readonly'
    },
    'parser': 'babel-eslint', // to support flowtype
    'parserOptions': {
        'ecmaVersion': 2018
    },
    'extends': [
        'standard',
        'plugin:flowtype/recommended'
    ],
    'plugins': [
        'json',
        'flowtype',
    ],
    'rules': {
        // generated by eslint cli
        'promise/param-names': [
            'off'
        ],
        'no-unused-vars': [
            'warn'
        ],
        'indent': [
            'error',
            2
        ],
        'linebreak-style': [
            'error',
            'unix'
        ],
        'quotes': [
            'error',
            'single',
            { allowTemplateLiterals: true }
        ],
        'semi': [
            'error',
            'never'
        ],
        // flow 
        'flowtype/no-types-missing-file-annotation': 0
    }
}
