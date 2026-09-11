# 项目标识

- 正式中文名：蓝色 3D 地图
- 英文代号：Blue Atlas 3D
- 用户简称“蓝色地图”“蓝色 3D”“Blue Atlas”时，均指本项目。
- 本地项目目录：`/Users/admin/Desktop/Codex.项目/地球/blue-atlas-local`
- 源码仓库：`https://github.com/li-design-lab/3d--`
- 公开网站：`https://li-design-lab.github.io/3d--/`

# 长期约束

- 本项目与原有绿色地图是两个独立项目，不得覆盖或合并。
- 全国省界使用用户提供的《中国_省.geojson》。
- 当前下钻支持省、市、区县；没有真实乡镇边界时必须明确提示，不得用模拟边界冒充。
- 分享给其他人时使用 GitHub Pages 公网地址，不使用 `file://`、`127.0.0.1` 或旧 `chatgpt.site` 地址。
- 修改后必须验证地图加载、左上角地区筛选、进入下级和返回上级，再发布。
- 本机日常预览固定使用 `http://127.0.0.1:5174/`，由用户级 LaunchAgent `local.blue-atlas.map` 管理。禁止用临时 Vite 进程替代此常驻服务。
- 修改 `dist/client` 后运行 `npm run local:install` 同步安装副本，再通过 `npm run local:status` 核验版本和健康状态。常驻副本位于 `~/Library/Application Support/Blue Atlas 3D/`；只改工作区不会更新已安装副本。
- 开发服务使用 5176，避免占用日常预览的 5174。桌面入口是 `打开蓝色3D地图.command`，会检查/恢复本机服务后打开 Chrome。

## 公路数据隐私
原始公路数据仅限本机。`.private/`、原始表格、原坐标衍生线路、浏览器证据不得提交或发布。公开目录只能使用 `scripts/generate-road-demo.mjs` 独立生成的演示数据。发布前执行 `scripts/audit-public.mjs`；不可将本机安装副本用于发布。
