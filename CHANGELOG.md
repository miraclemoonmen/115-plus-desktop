# 更新日志

## 未发布

- 修复播放器关闭后被隐藏、再次打开不可见，以及多个窗口重复处理应用退出的问题。
- 补充 Windows 下载文件名检查，避免保留名称、路径分隔符或 NTFS 数据流导致失败或写入非预期位置。
- 便携版提前检查网络运行库目录，启动失败时显示错误；运行库权限采用追加方式，保留已有授权。
- 修复 CI 专用调试脚本覆盖已有策略键的问题，增加不启动应用的 Windows 双环境检查。

## [1.1.0-rc.3](https://github.com/miraclemoonmen/115-plus-desktop/compare/v1.1.0-rc.2...v1.1.0-rc.3) (2026-10-30)

### ✨ 新功能

- 新增便携版：Windows ZIP 自带固定版本 WebView2，macOS ZIP 和 Linux AppImage 压缩包按平台分发。
- 凭证、设置、上传/下载数据库、应用日志和窗口状态统一保存在程序旁的 `data` 文件夹。
- 便携版关闭主窗口正常退出，有传输任务时沿用原有的确认和暂停流程。

### 🐛 修复与构建

- 便携版停用启动更新检查及安装更新器，“下载更新”打开发布页，替换程序时保留 `data`。
- 启动前检查数据目录可写性和 Windows 内置运行库，失败时提示并停止，不回落到系统目录。
- Windows 静态链接 VC 运行库，校验内置 WebView2 SHA256；兼容 Windows 10 所需的运行库目录读取权限。
- 补充更新流程回归及便携路径、写入保护测试，加入 Windows 两个运行环境的原生应用验证。
- 安装版继续使用原有的存储位置与更新流程。

## [1.1.0-rc.2](https://github.com/miraclemoonmen/115-plus-desktop/compare/v1.1.0-alpha.1...v1.1.0-rc.2) (2026-10-30)

### ✨ 新功能

- 新增星标文件入口，支持添加、取消星标，与 115 网盘同步。
- 新增文件分类筛选，支持文档、图片、音乐、视频、压缩包和应用，分类查询包含子目录。
- 云下载新增 BT 任务：选择本地种子、解析文件列表、勾选文件并指定保存目录，复用现有上传队列。
- 全部文件和搜索结果统一文件打开逻辑，支持视频播放、图片预览，以及媒体列表跨页加载。
- 云下载文件名支持进入对应位置，新增添加时间列；保存位置显示文件夹名称。

### 🎨 界面调整

- “我的文件”更名为“全部文件”，“离线下载”文案统一为“云下载”。
- 统一全部文件、星标、搜索、BT 列表和回收站的文件行及类型图标；视频按接口返回的清晰度展示标清、高清、1080P、4K 等图标。
- 云下载、回收站、下载列表和上传列表统一操作栏、表头、字体、列宽及垂直对齐；下载、上传由卡片调整为表格。
- 云下载、下载列表和上传列表复用状态图标、文字和百分比，保留速度、剩余时间、文件夹进度与错误信息。
- 应用主题调整为 115 蓝色；应用图标同步配色并增加透明留白，改善 macOS Dock 中图标偏大的问题。
- macOS 文件选择窗口补充简体中文本地化。

### 🗑️ 功能移除

- 移除本地收藏夹、收藏当前文件夹、展开收藏夹及右键添加到收藏夹，统一使用云端星标。
- 移除记忆排序模式，改为自定义排序，默认按创建时间倒序，并兼容旧配置迁移。
- 移除重复的页面标题、冗余种类列和网格右上角视频标记。
- 统一去掉文件名悬停下划线。

### 🐛 Bug 修复

- 修复二维码确认后仍停留在等待状态的问题，补充失败提示、刷新与请求取消处理。
- 修复播放器列表范围与当前查询条件不一致、搜索结果打开异常及混合结果判断问题。
- 不支持预览的文件增加明确提示，修复图片预览不能跨页切换。
- 修复下载重试设置未传到原生队列的问题。
- 修复同名下载可能覆盖本地文件的问题；使用原子创建和文件锁保护目标文件，校验断点归属，保留合法续传。
- 修复新目录创建前检查磁盘空间导致下载失败的问题。
- 统一原生下载进度事件格式，清理重复旧事件，修复前端进度处理异常。
- 修复网络异常被吞掉、旧请求覆盖新列表、回收站请求失败后持续加载的问题。
- 修复 BT 上传完成状态衔接及热更新后上传管理器实例分裂，避免解析流程一直等待。
- 移除完整请求、令牌响应及签名下载地址的调试输出。

### 🔄 上游同步

- 包含上游多选右键批量操作、搜索目录导航修复及依赖更新。
- 保留预发布版本使用 NSIS、DEB 和 AppImage 的兼容处理，避免 MSI/RPM 版本号限制。

### 🧪 验证与构建

- 增加 8 项前端回归检查；Rust 单元测试共 26 项。
- CI 与发布流程执行代码规范、类型、回归测试和平台构建检查；校验 AppID、发布签名配置和版本一致性。
- 修复未配置 Apple 证书时预发布打包误导入空证书的问题。
- 预发布按 Windows x64、macOS Apple Silicon、macOS Intel、Linux x64 分别构建。
- 本分支采用独立应用标识、更新地址与更新验签公钥，保留原作者署名；原作者版本的数据目录不自动迁移。

## [1.1.0-rc.1](https://github.com/miraclemoonmen/115-plus-desktop/compare/v1.1.0-alpha.1...v1.1.0-rc.1) (2026-10-30)

### ✨ 新功能

- 右键菜单支持多选批量操作 ([6718982](https://github.com/miraclemoonmen/115-plus-desktop/commit/6718982c893ba0a3c2390ec33a8aafb98e9ea978))
- 完善星标、BT 云下载与文件列表并修复传输可靠性 ([6c24f3f](https://github.com/miraclemoonmen/115-plus-desktop/commit/6c24f3f1632bb59647e66a3b08ee70064f9f5be7))

### 🐛 Bug 修复

- 修复搜索结果打开目录时导航被取消的问题 ([42ab0f9](https://github.com/miraclemoonmen/115-plus-desktop/commit/42ab0f9cad1fb8d82b086867eda55512e9a11911))
- 修复收藏夹面板状态在主页与弹窗间共享的问题 ([fbe0eee](https://github.com/miraclemoonmen/115-plus-desktop/commit/fbe0eeeb3e4cb298ff6b4c0628103a3c1fcde5db))

### 🔧 其他更新

- 更新依赖 ([f458063](https://github.com/miraclemoonmen/115-plus-desktop/commit/f4580632e4e79c63d10e30ae413ad6f157ccc706))
- 更新依赖 ([99d0b6e](https://github.com/miraclemoonmen/115-plus-desktop/commit/99d0b6ed4fc469a4a099cf00eb0559812805a8f6))

### 👷 CI 配置

- 预发布构建时跳过 RPM 打包 ([9b83a5a](https://github.com/miraclemoonmen/115-plus-desktop/commit/9b83a5ad6a85457cbebe47bcfec933a9663f9822))

## [1.1.0-alpha.1](https://github.com/lvzhenbo/115-plus-desktop/compare/v1.1.0-alpha.0...v1.1.0-alpha.1) (2026-09-16)

### ✨ 新功能

- 字幕选择列表添加虚拟滚动 ([2d3519d](https://github.com/lvzhenbo/115-plus-desktop/commit/2d3519d75f1558b3856eed604e65d2ad01487beb))
- 弹窗支持浏览器回退键关闭并将主页目录导航纳入路由 ([f0dd950](https://github.com/lvzhenbo/115-plus-desktop/commit/f0dd9509a445821c8ebea67cd95fa3a1ede871c4))
- 支持下载前选择保存目录 ([ade246a](https://github.com/lvzhenbo/115-plus-desktop/commit/ade246a9892e62511beef1335258a054c4ecb34f))
- 支持收藏文件夹功能及侧边栏展示 ([31dc2d2](https://github.com/lvzhenbo/115-plus-desktop/commit/31dc2d2d8e385f9401bb5f1b5125fe63c52f3558))
- 添加 OSS 独立上传代理设置 ([#28](https://github.com/lvzhenbo/115-plus-desktop/issues/28)) ([68d1aa7](https://github.com/lvzhenbo/115-plus-desktop/commit/68d1aa78ae8412bdea6b61b8e24d7739eb3dd0a3))
- 添加统一代理设置，更新/下载/上传共用一份配置 ([7baf8ef](https://github.com/lvzhenbo/115-plus-desktop/commit/7baf8ef8a0fa87e8d3898544544eec750db071b8))
- 重命名输入框支持回车键提交 ([c2a5a3b](https://github.com/lvzhenbo/115-plus-desktop/commit/c2a5a3b8a2c66d91b1eed291403f2ad938cb517b))
- 重构收藏夹交互，支持重命名、右键菜单与状态持久化 ([3212f83](https://github.com/lvzhenbo/115-plus-desktop/commit/3212f8346d3e8b6d526a01decb413dfde7c530b0))

### 🐛 Bug 修复

- 上传暂停恢复与 OSS UploadId 意外重置 ([#30](https://github.com/lvzhenbo/115-plus-desktop/issues/30)) ([e4ce091](https://github.com/lvzhenbo/115-plus-desktop/commit/e4ce091d39bd312273ac1c20235d3dd013889c21))
- 优化下载页滚动区域布局，避免滚动条遮挡内容 ([42e85dc](https://github.com/lvzhenbo/115-plus-desktop/commit/42e85dc80f0f23ad559c588b11cc672751794447))
- 修复 OSS 大文件断点续传 PartAlreadyExist 循环 ([#29](https://github.com/lvzhenbo/115-plus-desktop/issues/29)) ([e2d72ec](https://github.com/lvzhenbo/115-plus-desktop/commit/e2d72ec0c7239150d158ed3d89c4532462bd7523))
- 记忆排序模式下禁用表头手动排序并提示 ([9e3dde5](https://github.com/lvzhenbo/115-plus-desktop/commit/9e3dde5780356d2e2b1e095d2332cc9b9f136d14))
- 限制快捷键仅由最上层文件列表实例响应 ([799ccd9](https://github.com/lvzhenbo/115-plus-desktop/commit/799ccd958c028cd4955549d1b38ca34b80781a3d))

### ♻️ 代码重构

- 上传页由数据表格重构为卡片列表布局 ([444bf40](https://github.com/lvzhenbo/115-plus-desktop/commit/444bf40a77c8f574b491321126cb928a37169656))

### 🔧 其他更新

- 更新依赖 ([1eb9557](https://github.com/lvzhenbo/115-plus-desktop/commit/1eb9557fb7c1d86edaf7ff7f757bdcf52fffe772))
- 更新依赖 ([f463d12](https://github.com/lvzhenbo/115-plus-desktop/commit/f463d1228d8aee30398f985b5afe69c4ba0cd3c3))
- 更新依赖版本 ([1ba1395](https://github.com/lvzhenbo/115-plus-desktop/commit/1ba139515d83f74fdb01095f6b344b410843609f))
- 更新依赖版本 ([97a59eb](https://github.com/lvzhenbo/115-plus-desktop/commit/97a59eb3a9e70dc9f6c1fb67b6fb6b942a4cd7f8))

### 👷 CI 配置

- 为 Windows 预发布版本指定 NSIS 打包格式 ([9861118](https://github.com/lvzhenbo/115-plus-desktop/commit/98611188bc2fe3a10656cdc434a85bfc63e2a08c))
- 使用 pnpm/setup 统一安装 pnpm 与 Node.js ([3161215](https://github.com/lvzhenbo/115-plus-desktop/commit/3161215780688fc7a2bcc6f63055392eb2901ad7))
- 关闭 CI 构建的 updater 产物 ([6a41803](https://github.com/lvzhenbo/115-plus-desktop/commit/6a41803b84ce1ec00838282e2e740be0c1f792ac))

## [1.1.0-alpha.0](https://github.com/lvzhenbo/115-plus-desktop/compare/v1.0.7...v1.1.0-alpha.0) (2026-07-15)

### ✨ 新功能

- 优化上传和下载列表展示，增强用户体验 ([8ab1d1f](https://github.com/lvzhenbo/115-plus-desktop/commit/8ab1d1f716ab73805ce503c55cead198b87fc93a))
- 优化视频加载提示和中心指示器图标 ([dd6778f](https://github.com/lvzhenbo/115-plus-desktop/commit/dd6778f54d29df69ecfadca7c9948dffc69724ae))
- 使用motion优化旋转动画 ([bc8b8e2](https://github.com/lvzhenbo/115-plus-desktop/commit/bc8b8e2aceede3c9c1e3ab14cf6e4a00ec46a049))
- 在批量重命名模态框中添加限流提示信息，并优化布局 ([d4c13b6](https://github.com/lvzhenbo/115-plus-desktop/commit/d4c13b651fedc9d20d5a596b4de5151d5ee8bb1c))
- 增加发布前插入自定义更新日志和解析功能 ([cb43360](https://github.com/lvzhenbo/115-plus-desktop/commit/cb433603c035c6161ad09c3c3ba51aea81e2b4bd))
- 实验性重构下载文件视图，优化任务显示和操作功能，增强用户体验 ([3089e32](https://github.com/lvzhenbo/115-plus-desktop/commit/3089e329f21759a51151a75b75128f0b1d0d1552))
- 将下载功能初步从调用aria2更改为原生rust代码 ([0e422a1](https://github.com/lvzhenbo/115-plus-desktop/commit/0e422a117ba239f1b9069a1d2f4a5fa60f4a27d2))
- 拖拽上传 ([ecc90e9](https://github.com/lvzhenbo/115-plus-desktop/commit/ecc90e9dc4465cde2b705785387a0dd38d83137a))
- 搜索结果添加重命名功能，并优化重命名弹窗数据结构适配更多情况 ([38c9cab](https://github.com/lvzhenbo/115-plus-desktop/commit/38c9cab4765afc316d7c4b4857b721d0e1460fbf))
- 文件浏览器添加搜索功能 ([5ae6b33](https://github.com/lvzhenbo/115-plus-desktop/commit/5ae6b33744a7440b2825201ba44e9b5f68ca4f18))
- 添加 pnpm 工作区配置以禁用 lfa-ponyfill 构建 ([52c89fe](https://github.com/lvzhenbo/115-plus-desktop/commit/52c89fe11670cb21d40fa3048728a87a58d356e2))
- 添加CDN限流处理逻辑，优化下载重试机制 ([66d45a4](https://github.com/lvzhenbo/115-plus-desktop/commit/66d45a449fa8cf00403156b98502ca0a41db6fdf))
- 添加上传任务的预计剩余时间（ETA）功能，优化用户体验（使用CI的用户可能需要删除download.db文件） ([60c6b98](https://github.com/lvzhenbo/115-plus-desktop/commit/60c6b98dc3b527a3882d96cbddbd61ff62b08f0d))
- 添加图片预览功能，支持多图展示和缩略图显示 ([ee1e4bb](https://github.com/lvzhenbo/115-plus-desktop/commit/ee1e4bbe5da9eb85f88aab2ad4de4762b0a5233c))
- 添加应用日志级别设置功能，支持动态调整日志级别 ([d1345a9](https://github.com/lvzhenbo/115-plus-desktop/commit/d1345a946e96e4fa001c9acccb210ab5a92e14e3))
- 添加批量重命名功能，更新相关组件和类型定义 ([7c091dd](https://github.com/lvzhenbo/115-plus-desktop/commit/7c091dd9211c8eb9220c0ac4e74acad418f10783))
- 添加视频旋转功能和居中提示，提取视频播放器控制栏组件， ([ec33851](https://github.com/lvzhenbo/115-plus-desktop/commit/ec33851f2419feae5d2101a8febf570539bb3a9e))
- 添加窗口最小尺寸设置功能，允许用户自定义窗口最小宽度和高度 ([eaf1407](https://github.com/lvzhenbo/115-plus-desktop/commit/eaf1407b2e282c1801124a62ab32b94ccc9121df))
- 添加系统托盘，并清理优化rust注释 ([7bbd4df](https://github.com/lvzhenbo/115-plus-desktop/commit/7bbd4dfb96498ec01d3c029237ad7370aec8bf1e))
- 用户信息弹窗添加0.5s延迟 ([419a28a](https://github.com/lvzhenbo/115-plus-desktop/commit/419a28a3f052224134656e4ac4fed436a685b12f))

### 🐛 Bug 修复

- use custom dbus_id to fix Linux startup crash ([#12](https://github.com/lvzhenbo/115-plus-desktop/issues/12)) ([88783e8](https://github.com/lvzhenbo/115-plus-desktop/commit/88783e8e2c92cfa085bee25e252a643cdb6f0319))
- 一波下载功能修复 ([8de88d4](https://github.com/lvzhenbo/115-plus-desktop/commit/8de88d4c23811935cc41f388fbc742d5958b9c99))
- 修复上传进度聚合与速度计算功能；移除不再使用的上传速度和ETA字段 ([89588d9](https://github.com/lvzhenbo/115-plus-desktop/commit/89588d9a19226049fcce6763bdf99ab0830e35a3))
- 修复之前被搞坏的限流功能，更正活跃任务所需状态 ([984b5d2](https://github.com/lvzhenbo/115-plus-desktop/commit/984b5d291bf002170a1345352527bacc8879cf2c))
- 修复字体读取错误处理，确保从字体文件中正确读取字体家族名称 ([0bd972c](https://github.com/lvzhenbo/115-plus-desktop/commit/0bd972c0bf636347ebfe809551fa1aaa7871e76f))
- 修复文件夹下载前置流程，全程任务持久化 ([15de830](https://github.com/lvzhenbo/115-plus-desktop/commit/15de8304e09d4b17a7279935202a7bb9c5a93f79))
- 修复登录页时无法退出应用的问题 ([a4de6aa](https://github.com/lvzhenbo/115-plus-desktop/commit/a4de6aa96b7e4de8020d02e02640fc6a9ac0817c))
- 再次修复 ([87512a4](https://github.com/lvzhenbo/115-plus-desktop/commit/87512a4d46bc1d6dfc67470c986eae147e28c524))
- 增加前端渲染完成后的等待时间，避免白屏闪烁 ([343099c](https://github.com/lvzhenbo/115-plus-desktop/commit/343099cda8e9280401ac2e42f90df81d526841c7))
- 增强接口错误处理提示 ([b0c43f1](https://github.com/lvzhenbo/115-plus-desktop/commit/b0c43f1d8e86c206922cca67c666589d5137121c))
- 尝试修复跨平台错误 ([09991d6](https://github.com/lvzhenbo/115-plus-desktop/commit/09991d68135ae8caa99f2ce27e706cfa35311a34))
- 尝试解决macos上的特殊问题 ([678795e](https://github.com/lvzhenbo/115-plus-desktop/commit/678795e4b2a66deda10b5917e5518857f73dbcfc))
- 恢复最小化窗口以确保主窗口可见 ([009aa8e](https://github.com/lvzhenbo/115-plus-desktop/commit/009aa8e2f799f801d7490833aa10bc73cfa28de1))
- 更新 GitHub Actions 工作流中的依赖版本 ([235cd98](https://github.com/lvzhenbo/115-plus-desktop/commit/235cd98cfd64faa42481334fca8167449c50ce63))
- 更新 README 以修正下载引擎描述并添加新功能说明 ([87077f2](https://github.com/lvzhenbo/115-plus-desktop/commit/87077f28bd0300ce6f574f5e235590d48ac1dee6))
- 更新依赖，并将无人维护带有漏洞的ttf-parser迁移到skrifa ([cc5b04a](https://github.com/lvzhenbo/115-plus-desktop/commit/cc5b04aa2e1819c132f8abff8689f2073e7203de))
- 替换radash为es-toolkit，并修复和优化一下问题 ([db70a6a](https://github.com/lvzhenbo/115-plus-desktop/commit/db70a6a011e24f1443becc3778caf2bab153db2c))
- 规范类型使用 ([8357293](https://github.com/lvzhenbo/115-plus-desktop/commit/835729342cbe2d46a4493617489e61be6e576700))
- 解决pinia初始化冲突带来的白屏问题 ([8fa4728](https://github.com/lvzhenbo/115-plus-desktop/commit/8fa47287d9235553edf1f3ed82615dddf761ffd0))
- 解决toolbar和enable-search重复定义的问题 ([ef63933](https://github.com/lvzhenbo/115-plus-desktop/commit/ef63933dc889d7c19f6c57e53452d30ad6aec71a))
- 解决更新依赖后的问题 ([f331908](https://github.com/lvzhenbo/115-plus-desktop/commit/f331908d6170e042efcb32e9627e37822feed96d))
- 调整限流参数以优化下载性能 ([5417ae5](https://github.com/lvzhenbo/115-plus-desktop/commit/5417ae5e5d4bba167825b685a57f5f5927dc456c))
- 还原vite alias，tsconfigPaths目前有bug ([459fbf6](https://github.com/lvzhenbo/115-plus-desktop/commit/459fbf6603ac096511a2f5982b8fc81e764ffd2f))

### ♻️ 代码重构

- 使用指令替代motion组件，移除没啥用的缓冲进度条 ([a7537d9](https://github.com/lvzhenbo/115-plus-desktop/commit/a7537d977b9d05cfa5c4fd0391e2c34c108e66e2))
- 重构上传数据处理 ([e1cf3ce](https://github.com/lvzhenbo/115-plus-desktop/commit/e1cf3cef112b59f88b62907de2b1b82cb566211d))
- 重构下载数据处理，从前端转移到rust后端 ([4af781d](https://github.com/lvzhenbo/115-plus-desktop/commit/4af781d58fc6c840d69d1c13c13cf14836098688))
- 重构字幕解析和渲染，具体看详情，理论上应该彻底解决字体渲染问题 ([90fe577](https://github.com/lvzhenbo/115-plus-desktop/commit/90fe577e09c0e2c18fcc36e58a07e6111cade369))

### 🔧 其他更新

- 优化清理工程文件 ([a361981](https://github.com/lvzhenbo/115-plus-desktop/commit/a3619811219b4cbc6b2e3913713f315f42f949cc))
- 使用自定义插件解决发布内容为空的问题 ([ed72176](https://github.com/lvzhenbo/115-plus-desktop/commit/ed72176827538f21389357224428e96618c48c0c))
- 依赖日常更新 ([094f21e](https://github.com/lvzhenbo/115-plus-desktop/commit/094f21e147a9da51bbac551d99506d2286eff22a))
- 更新rust依赖 ([504b530](https://github.com/lvzhenbo/115-plus-desktop/commit/504b53030a891deea58cb59a7b3d86c753815bf7))
- 更新rust依赖 ([39b9dc2](https://github.com/lvzhenbo/115-plus-desktop/commit/39b9dc298ae0329471652003ed498d6d47cf9da3))
- 更新依赖 ([e83f2d1](https://github.com/lvzhenbo/115-plus-desktop/commit/e83f2d12239da7366ee33bf2bb5378bd7c7455a7))
- 更新依赖 ([eec92bc](https://github.com/lvzhenbo/115-plus-desktop/commit/eec92bc9266bcb56819212ab18c3da0a575d6225))
- 更新依赖 ([abbe6cc](https://github.com/lvzhenbo/115-plus-desktop/commit/abbe6ccea97e092b138934232655aed64d0cb34b))
- 更新依赖 ([4a4e196](https://github.com/lvzhenbo/115-plus-desktop/commit/4a4e196b708fb545a93f05d04625e66ac5a29ad4))
- 更新依赖 ([13b0f72](https://github.com/lvzhenbo/115-plus-desktop/commit/13b0f72e75ff96a97e6934fc729350ccb4185431))
- 更新依赖 ([b152157](https://github.com/lvzhenbo/115-plus-desktop/commit/b152157fe2e628cbecb81e30613784843c53ced4))
- 更新依赖 ([3f9197c](https://github.com/lvzhenbo/115-plus-desktop/commit/3f9197c13ebb1fb4017df66d164ef47d2fd7b70f))
- 更新依赖 ([43b32da](https://github.com/lvzhenbo/115-plus-desktop/commit/43b32daec7bce549dad5c75715d534f07865b62d))
- 更新依赖 ([2a08ee0](https://github.com/lvzhenbo/115-plus-desktop/commit/2a08ee064bbdee39b55a911b7e414ab399c905fa))
- 更新依赖 ([22511b5](https://github.com/lvzhenbo/115-plus-desktop/commit/22511b5ab2f71d8ea2259f46265284fd355839a6))
- 更新依赖，并添加lock文件的格式化忽略 ([4fa3692](https://github.com/lvzhenbo/115-plus-desktop/commit/4fa369223853ff1054120ad3920e63a6501b532e))
- 更新依赖，并解决sha1更新后的问题，为ci添加缓存 ([f461adb](https://github.com/lvzhenbo/115-plus-desktop/commit/f461adbff8986b19060f714d56dfd766a021d711))
- 更新依赖，添加eslint忽略项 ([8484ad9](https://github.com/lvzhenbo/115-plus-desktop/commit/8484ad96e434c8c9b19a3538fb541a625d172979))
- 更新依赖，自述里添加一些说明 ([ef8a309](https://github.com/lvzhenbo/115-plus-desktop/commit/ef8a30965164c4d558ce57ff58912bbca579e73c))
- 更新依赖并将pnpm版本升级到11 ([7f353cc](https://github.com/lvzhenbo/115-plus-desktop/commit/7f353cc8b46b68570cb3ab38c24abb9043a6aab2))
- 更新依赖项，替换fs2为fs4并升级相关版本；重构代码以使用LazyLock优化同步 ([123ef87](https://github.com/lvzhenbo/115-plus-desktop/commit/123ef874d3d56981d5f81aa20d0b7f5ad66a93ac))
- 更新问题模板 ([69b7a23](https://github.com/lvzhenbo/115-plus-desktop/commit/69b7a23f312785670a69cef7db5970292158c3c9))
- 格式化VSCode扩展推荐文件 ([c6a15db](https://github.com/lvzhenbo/115-plus-desktop/commit/c6a15dbb5f12e6b124170664e72fd75b5d7b3520))
- 注释掉获取aria2脚本的执行步骤 ([ee1e461](https://github.com/lvzhenbo/115-plus-desktop/commit/ee1e4611e1782498e5d025080cb02be8c1804a0a))
- 添加 Linux 平台兼容性描述 ([d865c57](https://github.com/lvzhenbo/115-plus-desktop/commit/d865c577b184020c1a94cf07377391416bd1b517))
- 添加问题模板 ([46d46af](https://github.com/lvzhenbo/115-plus-desktop/commit/46d46af91389622591f63b7fd4e46adb4adf6556))
- 移除过重的`@release-it/bumper`，改为自定义轻量插件 ([d2497b6](https://github.com/lvzhenbo/115-plus-desktop/commit/d2497b63640be5ed877e2ae8018770e4c4169827))

### 👷 CI 配置

- 优化发布脚本 ([dc80916](https://github.com/lvzhenbo/115-plus-desktop/commit/dc809166485485b67c39ef606036f980ee6f8a02))
- 修复构建工件名称格式，去掉args之间的分隔符 ([6792d9d](https://github.com/lvzhenbo/115-plus-desktop/commit/6792d9d89ec0743a88fd34cf65f321be2d6c0bc4))
- 修复预发布脚本 ([1c52a29](https://github.com/lvzhenbo/115-plus-desktop/commit/1c52a294ffa8a88721a3f537b83b854c6da77095))
- 再修预发布脚本 ([e5d9be5](https://github.com/lvzhenbo/115-plus-desktop/commit/e5d9be5609b5112166a62d319bb8e085b1cebc56))
- 更新CI/CD配置，支持macOS和Ubuntu平台构建 ([f58d40e](https://github.com/lvzhenbo/115-plus-desktop/commit/f58d40eaebd3ae11ff3956dc2dc93737d930b28e))
- 测试aria2的跨平台编译 ([8587b95](https://github.com/lvzhenbo/115-plus-desktop/commit/8587b956f0e2e1199bb15ef953596be566969f03))
- 添加预发布脚本 ([f482bf4](https://github.com/lvzhenbo/115-plus-desktop/commit/f482bf4c52372f423dc2a79b2be58c475d281ab9))

## [1.0.7](https://github.com/lvzhenbo/115-plus-desktop/compare/v1.0.6...v1.0.7) (2026-03-14)

### ✨ 新功能

- 将侧栏折叠功能移到头部，减少误触 ([e909222](https://github.com/lvzhenbo/115-plus-desktop/commit/e90922284104eab271eb5eec107ffaeac60e3cb1))

### 🐛 Bug 修复

- 修复数据库迁移SQL语句的格式 ([6cb6e1b](https://github.com/lvzhenbo/115-plus-desktop/commit/6cb6e1b56d878d9336f5665df41df80b8eb7e5a8))
- 修复空状态组件的居中显示 ([1dcaf8f](https://github.com/lvzhenbo/115-plus-desktop/commit/1dcaf8f40409deea71f4e9a6a4d38cfb8ac7fc4c))

### ♻️ 代码重构

- 使用vueuse优化键盘快捷键处理和单击计时器逻辑 ([16048fd](https://github.com/lvzhenbo/115-plus-desktop/commit/16048fdddaa4f0989b9d9d217d0a3fb222ad4895))
- 简化更新提示弹窗 ([d6e1ec3](https://github.com/lvzhenbo/115-plus-desktop/commit/d6e1ec3eac4b269b858020237fade93fdc548f5e))

### 🔧 其他更新

- 更新依赖，使用undici代替axios ([c006883](https://github.com/lvzhenbo/115-plus-desktop/commit/c006883c57f1c2508c128d75c57fd4c0e24ae7a1))

## [1.0.6](https://github.com/lvzhenbo/115-plus-desktop/compare/v1.0.5...v1.0.6) (2026-03-09)

### ✨ 新功能

- 优化重命名模态框，增加重置按钮并调整输入框样式 ([638f5b3](https://github.com/lvzhenbo/115-plus-desktop/commit/638f5b31453c2f80c7d4935a08562a7baec338a7))
- 在搜索模态中添加高亮显示功能，支持根据搜索值高亮文件名 ([9587c44](https://github.com/lvzhenbo/115-plus-desktop/commit/9587c4411934e598e3f4311d6c57d19502fcbcc1))
- 统一接口速率限制功能，添加接口速率限制设置，支持动态调整请求频率 ([659cc17](https://github.com/lvzhenbo/115-plus-desktop/commit/659cc17b7c6bbec4fdb5ac8e983d03053ddb0c7c))

### 🔧 其他更新

- 更新依赖 ([f80cdd5](https://github.com/lvzhenbo/115-plus-desktop/commit/f80cdd56393ce611c01a1f56900dc6e27857a1ea))
- 添加组件名强制使用 PascalCase 的 ESLint 规则 ([78638d1](https://github.com/lvzhenbo/115-plus-desktop/commit/78638d173bc8e5b4b927e5861d37ac10b03a1bb3))

## [1.0.5](https://github.com/lvzhenbo/115-plus-desktop/compare/v1.0.4...v1.0.5) (2026-03-06)

### 🐛 Bug 修复

- 修复更新应用时被aria2占用问题，并重启应用时弹出提示 ([d18637c](https://github.com/lvzhenbo/115-plus-desktop/commit/d18637c25a2e9ac263eb2cc41a2e03e9968ec530))

### ♻️ 代码重构

- 整理rust代码，分离aria2和数据库相关代码为独立模块 ([89544eb](https://github.com/lvzhenbo/115-plus-desktop/commit/89544eb5f883f8fc96e66684410c0af4132c2f1d))

### 📝 文档更新

- 更新 README.md，完善功能描述和开发说明 ([089d459](https://github.com/lvzhenbo/115-plus-desktop/commit/089d4597b4e8b2d1819673ef25bb86e96c821b55))

## [1.0.4](https://github.com/lvzhenbo/115-plus-desktop/compare/v1.0.3...v1.0.4) (2026-03-05)

### ✨ 新功能

- 添加 marked 库以支持更新说明的 Markdown 渲染 ([0af9c78](https://github.com/lvzhenbo/115-plus-desktop/commit/0af9c78da735117f81c6548b875cd207bf631b9c))

### 🐛 Bug 修复

- 修正 updater 插件的 pubkey 格式 ([ab3a072](https://github.com/lvzhenbo/115-plus-desktop/commit/ab3a0729a72257a39e8f24c44dcd83bd4097fd48))

## [1.0.3](https://github.com/lvzhenbo/115-plus-desktop/compare/v1.0.2...v1.0.3) (2026-03-05)

### 🔧 其他更新

- 工程规范，并测试更新功能 ([71b1efa](https://github.com/lvzhenbo/115-plus-desktop/commit/71b1efa46e8329db4d89b6631376a24576ceb78b))
