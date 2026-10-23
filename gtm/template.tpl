___INFO___

{
  "type": "TAG",
  "id": "cvt_temp_public_id",
  "version": 1,
  "securityGroups": [],
  "displayName": "Specify Advertiser",
  "brand": {
    "id": "brand_dummy",
    "displayName": ""
  },
  "description": "Load Specify and forward consent, identity, event, and logout actions to the advertiser SDK.",
  "containerContexts": [
    "WEB"
  ]
}


___TEMPLATE_PARAMETERS___

[
  {
    "type": "SELECT",
    "name": "action",
    "displayName": "Action",
    "simpleValueType": true,
    "defaultValue": "capture",
    "selectItems": [
      {
        "value": "init",
        "displayValue": "Initialize"
      },
      {
        "value": "setCookieConsent",
        "displayValue": "Update cookie consent"
      },
      {
        "value": "identify",
        "displayValue": "Identify user or wallets"
      },
      {
        "value": "capture",
        "displayValue": "Capture event"
      },
      {
        "value": "reset",
        "displayValue": "Reset identity (logout)"
      }
    ]
  },
  {
    "type": "TEXT",
    "name": "advertiserKey",
    "displayName": "Advertiser key",
    "simpleValueType": true,
    "defaultValue": "",
    "help": "Your Specify advertiser key, starting with sak_.",
    "enablingConditions": [
      {
        "paramName": "action",
        "paramValue": "init",
        "type": "EQUALS"
      }
    ],
    "valueValidators": [
      {
        "type": "NON_EMPTY"
      }
    ]
  },
  {
    "type": "TEXT",
    "name": "apiUrl",
    "displayName": "API URL",
    "simpleValueType": true,
    "defaultValue": "https://spfsrv.com",
    "help": "Leave the default unless Specify gives you another API URL.",
    "enablingConditions": [
      {
        "paramName": "action",
        "paramValue": "init",
        "type": "EQUALS"
      }
    ],
    "valueValidators": [
      {
        "type": "NON_EMPTY"
      }
    ]
  },
  {
    "type": "TEXT",
    "name": "cookieConsent",
    "displayName": "Cookie consent",
    "simpleValueType": true,
    "defaultValue": "",
    "help": "Use true or false, or a variable returning a boolean. Fire when your consent manager has a decision and whenever it changes. Unknown values do not change consent.",
    "enablingConditions": [
      {
        "paramName": "action",
        "paramValue": "setCookieConsent",
        "type": "EQUALS"
      }
    ],
    "valueValidators": [
      {
        "type": "NON_EMPTY"
      }
    ]
  },
  {
    "type": "TEXT",
    "name": "identity",
    "displayName": "User ID or wallets",
    "simpleValueType": true,
    "defaultValue": "",
    "help": "Your application user ID, one EVM wallet address, or a variable returning an array of EVM wallet addresses. Do not use an email address. Pass arrays as variables, not JSON text.",
    "enablingConditions": [
      {
        "paramName": "action",
        "paramValue": "identify",
        "type": "EQUALS"
      }
    ],
    "valueValidators": [
      {
        "type": "NON_EMPTY"
      }
    ]
  },
  {
    "type": "TEXT",
    "name": "eventName",
    "displayName": "Event name",
    "simpleValueType": true,
    "defaultValue": "",
    "help": "For example, signup or purchase. Fire only after the action succeeds.",
    "enablingConditions": [
      {
        "paramName": "action",
        "paramValue": "capture",
        "type": "EQUALS"
      }
    ],
    "valueValidators": [
      {
        "type": "NON_EMPTY"
      }
    ]
  }
]


___SANDBOXED_JS_FOR_WEB_TEMPLATE___

const createArgumentsQueue = require('createArgumentsQueue');
const injectScript = require('injectScript');

const specify = createArgumentsQueue('specifyAdvertiser', 'specifyAdvertiser.q');

switch (data.action) {
  case 'init':
    specify('init', {advertiserKey: data.advertiserKey, apiUrl: data.apiUrl});
    injectScript('https://spfsrv.com/sdk/advertiser.js', data.gtmOnSuccess, data.gtmOnFailure, 'specify-advertiser');
    return;
  case 'setCookieConsent':
    if (data.cookieConsent !== true && data.cookieConsent !== false &&
        data.cookieConsent !== 'true' && data.cookieConsent !== 'false') {
      data.gtmOnFailure();
      return;
    }
    specify('setCookieConsent', data.cookieConsent === true || data.cookieConsent === 'true');
    break;
  case 'identify':
    specify('identify', data.identity);
    break;
  case 'capture':
    specify('capture', data.eventName);
    break;
  case 'reset':
    specify('reset');
    break;
  default:
    data.gtmOnFailure();
    return;
}

data.gtmOnSuccess();


___WEB_PERMISSIONS___

[
  {
    "instance": {
      "key": {
        "publicId": "access_globals",
        "versionId": "1"
      },
      "param": [
        {
          "key": "keys",
          "value": {
            "type": 2,
            "listItem": [
              {
                "type": 3,
                "mapKey": [
                  {
                    "type": 1,
                    "string": "key"
                  },
                  {
                    "type": 1,
                    "string": "read"
                  },
                  {
                    "type": 1,
                    "string": "write"
                  },
                  {
                    "type": 1,
                    "string": "execute"
                  }
                ],
                "mapValue": [
                  {
                    "type": 1,
                    "string": "specifyAdvertiser"
                  },
                  {
                    "type": 8,
                    "boolean": true
                  },
                  {
                    "type": 8,
                    "boolean": true
                  },
                  {
                    "type": 8,
                    "boolean": false
                  }
                ]
              },
              {
                "type": 3,
                "mapKey": [
                  {
                    "type": 1,
                    "string": "key"
                  },
                  {
                    "type": 1,
                    "string": "read"
                  },
                  {
                    "type": 1,
                    "string": "write"
                  },
                  {
                    "type": 1,
                    "string": "execute"
                  }
                ],
                "mapValue": [
                  {
                    "type": 1,
                    "string": "specifyAdvertiser.q"
                  },
                  {
                    "type": 8,
                    "boolean": true
                  },
                  {
                    "type": 8,
                    "boolean": true
                  },
                  {
                    "type": 8,
                    "boolean": false
                  }
                ]
              }
            ]
          }
        }
      ]
    },
    "clientAnnotations": {
      "isEditedByUser": true
    },
    "isRequired": true
  },
  {
    "instance": {
      "key": {
        "publicId": "inject_script",
        "versionId": "1"
      },
      "param": [
        {
          "key": "urls",
          "value": {
            "type": 2,
            "listItem": [
              {
                "type": 1,
                "string": "https://spfsrv.com/sdk/advertiser.js"
              }
            ]
          }
        }
      ]
    },
    "clientAnnotations": {
      "isEditedByUser": true
    },
    "isRequired": true
  }
]


___TESTS___

scenarios:
- name: Initialization queues configuration and loads the script
  code: |-
    const commands = [];
    mock('createArgumentsQueue', () => (name, value) => commands.push(name === 'reset' ? [name] : [name, value]));
    mock('injectScript', (url, success) => {
      assertThat(url).isEqualTo('https://spfsrv.com/sdk/advertiser.js');
      success();
    });
    runCode({action: 'init', advertiserKey: 'sak_test', apiUrl: 'http://localhost:3001'});
    assertThat(commands).isEqualTo([['init', {advertiserKey: 'sak_test', apiUrl: 'http://localhost:3001'}]]);
    assertApi('injectScript').wasCalled();
    assertApi('gtmOnSuccess').wasCalled();
    assertApi('gtmOnFailure').wasNotCalled();
- name: Script failure is reported
  code: |-
    mock('createArgumentsQueue', () => () => {});
    mock('injectScript', (url, success, failure) => failure());
    runCode({action: 'init', advertiserKey: 'sak_test', apiUrl: 'http://localhost:3001'});
    assertApi('gtmOnFailure').wasCalled();
    assertApi('gtmOnSuccess').wasNotCalled();
- name: Actions forward consent, wallet arrays, capture and reset separately
  code: |-
    const commands = [];
    const wallets = ['0x1111111111111111111111111111111111111111'];
    mock('createArgumentsQueue', () => (name, value) => commands.push(name === 'reset' ? [name] : [name, value]));
    runCode({action: 'setCookieConsent', cookieConsent: 'false'});
    runCode({action: 'setCookieConsent', cookieConsent: true});
    runCode({action: 'identify', identity: wallets});
    runCode({action: 'capture', eventName: 'signup'});
    runCode({action: 'reset'});
    assertThat(commands).isEqualTo([['setCookieConsent', false], ['setCookieConsent', true], ['identify', wallets], ['capture', 'signup'], ['reset']]);
    assertApi('injectScript').wasNotCalled();
- name: Unknown consent and actions do not submit commands
  code: |-
    const commands = [];
    mock('createArgumentsQueue', () => (name, value) => commands.push(name === 'reset' ? [name] : [name, value]));
    runCode({action: 'setCookieConsent'});
    runCode({action: 'setCookieConsent', cookieConsent: 'unknown'});
    runCode({action: 'unsupported'});
    assertThat(commands).isEqualTo([]);
    assertApi('gtmOnFailure').wasCalled();
    assertApi('gtmOnSuccess').wasNotCalled();


___NOTES___

Import this template, then create a tag for each action and attach the appropriate trigger. Test in Preview before publishing.
