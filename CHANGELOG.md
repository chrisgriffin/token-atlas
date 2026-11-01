# Changelog

All notable changes to Token Atlas are documented here.

## [1.1.0](https://github.com/chrisgriffin/token-atlas/compare/v1.0.0...v1.1.0) (2026-11-01)

### Features

* **deprecation:** carry out a token deprecation — mark it, move its uses, remove it once unused ([384b339](https://github.com/chrisgriffin/token-atlas/commit/384b339187e43a3f5c8c751ff37888a24bb6fcc1)), closes [#28](https://github.com/chrisgriffin/token-atlas/issues/28)
* **deprecation:** put the workflow behind tokenAtlas.deprecationWorkflow and keep renamed names as aliases ([c3620e1](https://github.com/chrisgriffin/token-atlas/commit/c3620e1b6b742a02a323c5fa7f438c9014425d08))
* **editor:** a right-click menu on the visual editor's tokens and groups ([f2b1151](https://github.com/chrisgriffin/token-atlas/commit/f2b11516367597f53dfd9d107b5efa9388637f6d)), closes [#48](https://github.com/chrisgriffin/token-atlas/issues/48)
* **editor:** ask before the right-click menu deletes a token or group ([a0a6f7e](https://github.com/chrisgriffin/token-atlas/commit/a0a6f7eedb2993b102c0079e507ad1ec8a13a711))

### Bug Fixes

* **deps:** pin patched serialize-javascript and @azure/msal-node ([c08edd6](https://github.com/chrisgriffin/token-atlas/commit/c08edd6e0112f279c33cfbad4e073bfcd5ea96a2)), closes [#34](https://github.com/chrisgriffin/token-atlas/issues/34)
* **editor:** a group's delete count takes in overrides the view keeps a row for ([ce8c4cb](https://github.com/chrisgriffin/token-atlas/commit/ce8c4cb5999534592df6e87ac875b37fc463de4d))
* **editor:** an inherited group heading's right-click menu offers no Rename or Delete ([851391c](https://github.com/chrisgriffin/token-atlas/commit/851391ce2a63838532dfec018930e9c89aad6ba6)), closes [#58](https://github.com/chrisgriffin/token-atlas/issues/58)
* **editor:** count every row a menu delete takes out of the view ([5eabd66](https://github.com/chrisgriffin/token-atlas/commit/5eabd66f73e06ef6bf780df10661c25638247292))
* **editor:** menu delete counts what leaves the view and skips inherited groups ([505fd55](https://github.com/chrisgriffin/token-atlas/commit/505fd55bf4ae47fd4bae931efca66263bbab8f1e))
* **editor:** menu references keep their tab, panel follows menu edits ([bc90eaa](https://github.com/chrisgriffin/token-atlas/commit/bc90eaa2ad20ef512b94912b57cd5907be6dc8fc))
* **editor:** name $ref and parse errors right in the menu Delete prompt ([c1b2f4b](https://github.com/chrisgriffin/token-atlas/commit/c1b2f4ba1d507be50a37a57027acf71e8d914799))
* **editor:** name the $extends that loses a row, not an inner $ref that holds ([379a78e](https://github.com/chrisgriffin/token-atlas/commit/379a78e6006f35a910369afdbcabce6272e34e74))
* **editor:** the Delete prompt names the key that placed each inherited row ([373c51a](https://github.com/chrisgriffin/token-atlas/commit/373c51afd9f6c17087f5d8f4467bb872f4cb63f8))
* **editor:** the detail panel follows every menu edit ([bfd61f4](https://github.com/chrisgriffin/token-atlas/commit/bfd61f4d8ca01eb928eea43d3136c2b4848828f1)), closes [#55](https://github.com/chrisgriffin/token-atlas/issues/55)
* **editor:** the inherited-row refusal names the $extends that supplies the row ([dacd4e3](https://github.com/chrisgriffin/token-atlas/commit/dacd4e3b9252e0c0596963f1ea5a4780a31209f5))
* **editor:** the refusal's supplier check covers headings and cross-file targets ([51bffae](https://github.com/chrisgriffin/token-atlas/commit/51bffae8f9b13e75c0555d68f76bd6b41d8d8291))
* **rename:** leave DOM style properties in JS/TS alone ([100a782](https://github.com/chrisgriffin/token-atlas/commit/100a782aafd75c5f986cd74b76c11ffa0faceeff)), closes [#16](https://github.com/chrisgriffin/token-atlas/issues/16)
* **rename:** skip a style object's key even when imported, keep declare exports ([1bd4abd](https://github.com/chrisgriffin/token-atlas/commit/1bd4abd177c39c268d84410e247eae6ce80eefa6))
* **test:** name a VS Code startup hang in the integration step ([3f7a2af](https://github.com/chrisgriffin/token-atlas/commit/3f7a2afc54e992581a93d801486bebca10118f05)), closes [#2](https://github.com/chrisgriffin/token-atlas/issues/2)

### Documentation

* **adr-002:** name the destructured tokens key that rename skips ([a6d9f36](https://github.com/chrisgriffin/token-atlas/commit/a6d9f36ee1071cb6b6a3baa3e1777a9a37366bfc)), closes [#37](https://github.com/chrisgriffin/token-atlas/issues/37)
* **adr-002:** say which side reads undefined after the rename ([4e5b0e8](https://github.com/chrisgriffin/token-atlas/commit/4e5b0e87c9847480253639db8d4ac831efc514fb))
* **deprecation:** fix the test count and name the replacement check ([8e93f44](https://github.com/chrisgriffin/token-atlas/commit/8e93f44609c983ec240460f1bb21fcc61cf8337e))
* **deprecation:** say which parts work with the workflow setting off ([700a392](https://github.com/chrisgriffin/token-atlas/commit/700a392e67380bd2ccd9c01b30d6ea7cc2b52785))
* **design:** name all three Delete refusals; inheritedVia only on tokens ([a85ca15](https://github.com/chrisgriffin/token-atlas/commit/a85ca15ef43492ff2a9a45e69f3a6aac07e44234))
* **design:** name group-level $ref beside $extends for an inherited heading ([f740318](https://github.com/chrisgriffin/token-atlas/commit/f7403180c3deba29028770f2c31fd625ca6939d3))
* **evaluator-gate:** say v1 reads the token as the ops-checkout fallback ([7ed8ae0](https://github.com/chrisgriffin/token-atlas/commit/7ed8ae0e88fcf0fe02b44d3e216d12a529d9aed2))
* give the reason in words instead of old-tracker issue numbers ([be998b0](https://github.com/chrisgriffin/token-atlas/commit/be998b07744ce296e7c78eff4284933f4afb0bad)), closes [#41](https://github.com/chrisgriffin/token-atlas/issues/41)
* **release:** say a release also publishes to Open VSX ([b4d9895](https://github.com/chrisgriffin/token-atlas/commit/b4d98956c87a1d117e400348a60b9924d15fef7e)), closes [#21](https://github.com/chrisgriffin/token-atlas/issues/21)
* **rename:** name the shorthand style key as a known limit ([050f1ac](https://github.com/chrisgriffin/token-atlas/commit/050f1acaa698ede1409c7805ce62fde84fd6c1c4))
* **spec:** a right-click menu on the visual editor's tokens and groups ([a90349c](https://github.com/chrisgriffin/token-atlas/commit/a90349c505050a1df08a1550af7a083b4c478645))
* **spec:** adopt the regroomed runnable line for [#54](https://github.com/chrisgriffin/token-atlas/issues/54) ([e146f56](https://github.com/chrisgriffin/token-atlas/commit/e146f566c0beb548e9c91790cc6a3728907f756e))
* **spec:** an inherited group heading's right-click menu offers no Rename or Delete ([1cfbfed](https://github.com/chrisgriffin/token-atlas/commit/1cfbfed4846334dfab5f58a2e32034dff8b32e9a))
* **spec:** carry out a token deprecation — mark it, move its uses, remove it once unused ([6eeb7a1](https://github.com/chrisgriffin/token-atlas/commit/6eeb7a1a3282e8fcc6e8add781db6388839d7585))
* **spec:** Delete from the visual editor's right-click menu asks before removing a token or group ([6c4e91f](https://github.com/chrisgriffin/token-atlas/commit/6c4e91f5e5e2062d7f4b9d9ca333417364aa742a))
* **spec:** give every spec folder a unique number ([1b14a53](https://github.com/chrisgriffin/token-atlas/commit/1b14a535da0400e921127a4487bbd5244d78b7e4))
* **spec:** make the deprecation runnable line actually red ([afaed56](https://github.com/chrisgriffin/token-atlas/commit/afaed56771025339608f28043b1c53ce2b6f0659))
* **specs:** give every spec folder a unique number ([d22cf98](https://github.com/chrisgriffin/token-atlas/commit/d22cf98dbbc5b9e61229035ef7e637b9c70d9071))
* **specs:** name the token reset as a precondition, drop "or expired" ([41ed727](https://github.com/chrisgriffin/token-atlas/commit/41ed72754646554259962064ef55a01d7b61d14f))
* **specs:** plan says the menu counts view rows a delete removes ([df941a5](https://github.com/chrisgriffin/token-atlas/commit/df941a51dc36e28b7e2428102a970c3b04226f3b))
* **specs:** state why the 019 drop-changelog folder is kept ([1cfa9b7](https://github.com/chrisgriffin/token-atlas/commit/1cfa9b7b185340890dc6be395285a14a1d97752e))
* **spec:** the detail panel follows every right-click menu edit ([3e98b33](https://github.com/chrisgriffin/token-atlas/commit/3e98b3300d74903af638a6ba188581c114b441ba))

### Build System

* adopt the shared configs from chrisgriffin/config ([a098b77](https://github.com/chrisgriffin/token-atlas/commit/a098b77e991fd2a2f6822562a0d8132b425e948e)), closes [#32](https://github.com/chrisgriffin/token-atlas/issues/32)

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
