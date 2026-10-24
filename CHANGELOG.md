# Changelog

All notable changes to Token Atlas are documented here.

## [1.0.1](https://github.com/chrisgriffin/token-atlas/compare/v1.0.0...v1.0.1) (2026-10-23)

### Bug Fixes

* **test:** name a VS Code startup hang in the integration step ([3f7a2af](https://github.com/chrisgriffin/token-atlas/commit/3f7a2afc54e992581a93d801486bebca10118f05)), closes [#2](https://github.com/chrisgriffin/token-atlas/issues/2)

### Documentation

* **release:** say a release also publishes to Open VSX ([b4d9895](https://github.com/chrisgriffin/token-atlas/commit/b4d98956c87a1d117e400348a60b9924d15fef7e)), closes [#21](https://github.com/chrisgriffin/token-atlas/issues/21)

## [1.0.0](https://github.com/chrisgriffin/token-atlas/compare/v0.30.2...v1.0.0) (2026-10-23)

### Features

* **listing:** name Chris Griffin as author, with chrisgriffin.io ([fbceb78](https://github.com/chrisgriffin/token-atlas/commit/fbceb78c5559e4c482e04220735f4ef02a76d53c))

### Bug Fixes

* **color-picker:** write the picked color as the visual editor does, keeping an explicit alpha ([106b323](https://github.com/chrisgriffin/token-atlas/commit/106b323ec581703bb8aafa43c001d4bedf8706a0))
* **color:** write a 6-digit hex, read only well-formed colors and blend alpha into contrast ([d0086eb](https://github.com/chrisgriffin/token-atlas/commit/d0086ebc39fc8db016b9d2d3d30f635a2323f6af))
* **core:** follow DTCG 2025.10 and keep the file's formatting ([1855cfe](https://github.com/chrisgriffin/token-atlas/commit/1855cfe31ea18cf5b39f51c321daf6ba2c33213c)), closes [#10](https://github.com/chrisgriffin/token-atlas/issues/10)
* **core:** keep a blank token file free of a syntax error ([53f19e2](https://github.com/chrisgriffin/token-atlas/commit/53f19e2893ca1e4858576e722573d8ba3b1d38eb))
* **deps:** bump @types/node to ^22 and move vitest config to projects ([73a0cf1](https://github.com/chrisgriffin/token-atlas/commit/73a0cf1826843248d218c5f9eb531c61be5fe905))
* **exports:** match only stylesheet variables, so rename never rewrites a CSS property ([09d7342](https://github.com/chrisgriffin/token-atlas/commit/09d7342feccba0066e6456ef03c87a31a3553bf7))
* **host:** index a .json file created after the scan once it holds tokens ([f6f105c](https://github.com/chrisgriffin/token-atlas/commit/f6f105cf116d7866a2780066e6f04897a07d348e))
* **host:** update the token index per edit, and close host gaps before 1.0 ([d309e28](https://github.com/chrisgriffin/token-atlas/commit/d309e28fbd5271ab4d4d6373735ba01aaf3e207b))
* **lint:** report a contrast pair with an undefined foreground, and allow a leading digit in PascalCase ([f166de3](https://github.com/chrisgriffin/token-atlas/commit/f166de3a69b34ec94acfe3b937d3947281d3570a))
* **listing:** publish under the chrisgriffinio Marketplace publisher ([6956465](https://github.com/chrisgriffin/token-atlas/commit/69564657f4f405be12f6a397e90baaca78895560))
* **listing:** ready the README, manifest and package for the Marketplace ([99f7ae2](https://github.com/chrisgriffin/token-atlas/commit/99f7ae2ae1a8249e2f070ce1e2c40556502b269a)), closes [#7](https://github.com/chrisgriffin/token-atlas/issues/7)
* **new-file:** drop trailing dots and refuse Windows device names ([58ccc1e](https://github.com/chrisgriffin/token-atlas/commit/58ccc1e533eef815ec8a58c22d18c8d54b0e9391))
* **rename:** keep one name check, in core, and refuse $root ([29dc8d5](https://github.com/chrisgriffin/token-atlas/commit/29dc8d5e2826fbea0ccf05434ac5b968434fe32e))
* **units:** show rem conversions to 4 decimals, so 1px reads 0.0625rem ([aa92796](https://github.com/chrisgriffin/token-atlas/commit/aa9279609b0f0f548bcbed4222def3405ef55316))
* **webview:** stop composite edits corrupting values and keep the panel's place ([89ff08c](https://github.com/chrisgriffin/token-atlas/commit/89ff08c18aba3185a18d40d0110f5cbb93098a11)), closes [#8](https://github.com/chrisgriffin/token-atlas/issues/8)

### Documentation

* **readme:** credit Chris Griffin with a link to chrisgriffin.io ([b5de2a3](https://github.com/chrisgriffin/token-atlas/commit/b5de2a374b136a2b3c347738ef1d0cd3d517ec2e))
* **spec:** core model follows DTCG 2025.10 and keeps the file's formatting ([7f0a577](https://github.com/chrisgriffin/token-atlas/commit/7f0a5775f812ed41d4cadc4d8990bd2c94d7e286))
* **spec:** host layer fixes before 1.0 ([efc5b84](https://github.com/chrisgriffin/token-atlas/commit/efc5b841430e4eadf4d37b41a1f8a709ca5a4fe0))
* **spec:** match the merge-order criterion to issue [#12](https://github.com/chrisgriffin/token-atlas/issues/12) ([24e07df](https://github.com/chrisgriffin/token-atlas/commit/24e07dfa7170d4265628e29f9de9a6f811de464b))
* **testing:** name the webview project, not environmentMatchGlobs ([ba30bdc](https://github.com/chrisgriffin/token-atlas/commit/ba30bdc8566a6ea353977f1c9d4128a079a821f4))

## 0.30.2 (2026-10-21)

First public release.
