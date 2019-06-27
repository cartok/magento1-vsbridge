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
    'parserOptions': {
        'ecmaVersion': 2018
    },
    'extends': 'standard',
    'plugins': [
        'json'
    ],
    'rules': {
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
        ]
    }
}
