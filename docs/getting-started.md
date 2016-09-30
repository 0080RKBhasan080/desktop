# Getting started

## Prerequisites

### Node.js

We use some ES6+ language constructs in our build scripts so you need [Node.js](https://nodejs.org) 6+ (just pick whatever the 'current' release is at the moment). Node 6 comes with npm 3 out of the box and while npm 3 isn't strictly necessary to build it does make things more efficient, especially on Windows where deep folder hierarchies can be detrimental to build speed.

*Windows only: Make sure you allow the Node.js installer to add node to the PATH, it'll make life much easier for you. Also, make sure you're on NPM 3.10.4 or higher. You can check via `npm -v`. If not, run `npm install -g npm`*

### node-gyp

node-gyp is required to build some of our native npm packages (such as [keytar](https://github.com/atom/node-keytar))

* Install python 2.7 ([Windows](https://www.python.org/downloads/windows/), [macOS](https://www.python.org/downloads/mac-osx/))
* **macOS:** Xcode and Xcode Command Line Tools (Xcode -> Preferences -> Downloads)
* **Windows:** Visual Studio 2015 or [Visual C++ Build Tools](http://go.microsoft.com/fwlink/?LinkId=691126)
  * Run `npm config set msvs_version 2015` after installing the build tools

*Windows only*: Let python install into the default suggested path (`c:\Python27`), don't try to move it into Program Files or else you'll have to configure node-gyp manually with the path.

### Certificates

#### macOS

1. Download the [`developer-id-cert.p12`](https://github.com/desktop/desktop-secrets/blob/master/developer-id-cert.p12) and then open it.
1. Ask a member of the Desktop team for the password.
1. Add it to your Keychain.

### OAuth Secret

The OAuth secret is embedded in the app at build time using the `DESKTOP_OAUTH_CLIENT_SECRET` environment variable. The secret is needed only if you want to log in a new user using dev builds of the app. For day to day development it shouldn't be necessary. If you do need it, ask a member of the Desktop team.

## Building

* Run `npm install` to get all required dependencies on your machine.
* Run `npm run build:dev` to make a development build of the app.
* Run `npm start` to launch the application. After it's successfully launched you can make changes which will be compiled in the background and these changes will either be hot-loaded into the app (if possible) or accessed by reloading the app (Ctrl/Command+R).

If you've made changes to the main-process you need to run `npm run rebuild:dev` and then `npm run start` for these changes to be reflected.

## Running tests

- `npm run test:unit` - Runs all unit tests
- `npm run test:integration` - Runs all integration tests
- `npm run test` - Runs all unit- and integration tests

**ProTip** If you're only interested in the results of a single test and don't wish to run the entire test suite to see it you can pass along a search string in order to only run the tests that match that string.

```
npm run test:unit -- --grep CloneProgressParser
```

Will run all tests matching `CloneProgressParser`.

## Using Atom?

If you're using [Atom](https://atom.io/) there's some plugins that you might want to install

* [atom-typescript](https://atom.io/packages/atom-typescript) - Syntax highlighting and intellisense for TypeScript
* [atom-build-npm-apm](https://atom.io/packages/build-npm-apm) - Lets you invoke all npm scripts straight from the editor by pressing F7 (requires [atom-build](https://atom.io/packages/build))
* [linter](https://atom.io/packages/linter) and [linter-tslint](https://atom.io/packages/linter-tslint) - Shows linter errors and warning in the editor

### Using Atom with Typescript 2

Atom-typescript doesn't support TS 2 out of the box right now so you have to [manually specify the path to typescriptServices.js](https://github.com/TypeStrong/atom-typescript/issues/1003#issuecomment-231793772).

Start by installing Typescript 2 globally

`npm install -g typescript@latest`

Then switch to atom and follow these steps

1. Open Settings
2. Go to Packages
3. Locate the atom-typescript package and select settings
4. Under settings, locate the textbox with the label 'Full path to a custom 'typescriptServices.js'
5. Provide the path
 * For Mac: `/usr/local/lib/node_modules/typescript/lib/typescriptServices.js`
 * For Windows: `C:\Users\[YOUR USERNAME]\AppData\Roaming\npm\node_modules\typescript\lib\typescriptServices.js`

## Troubleshooting

### Issues compiling node-keytar on Windows

If keytar fails to build on Windows with the following error during `npm install`:

```
npm ERR! keytar@3.0.2 install: `node-gyp rebuild`
npm ERR! Exit status 1
npm ERR!
npm ERR! Failed at the keytar@3.0.2 install script 'node-gyp rebuild'.
npm ERR! Make sure you have the latest version of node.js and npm installed.
npm ERR! If you do, this is most likely a problem with the keytar package,
npm ERR! not with npm itself.
npm ERR! Tell the author that this fails on your system:
npm ERR!     node-gyp rebuild
npm ERR! You can get information on how to open an issue for this project with:
npm ERR!     npm bugs keytar
npm ERR! Or if that isn't available, you can get their info via:
npm ERR!     npm owner ls keytar
```

Make sure you're using npm >= 2.15.9

```
PS> npm -g install npm@latest
```

and run `npm install`

(See https://github.com/atom/node-keytar/issues/45 and https://github.com/nodejs/node-gyp/issues/972)
